import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";
import { SCRIPT_SYSTEM_INSTRUCTION } from "../constants";
import { VoiceType, HookStyle } from "../types";

const API_BASE = "/api";

// Retry logic (ai-media-lab-app dagi kabi)
async function retry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const msg = error?.message || JSON.stringify(error);
    const isServerError = error?.status === 500 || msg.includes("500") || msg.includes("overloaded");
    if (retries > 0 && isServerError) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return retry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

// Robust JSON parser with repair logic
const parseResponse = (text: string) => {
  let cleanText = text.trim().replace(/```json/g, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleanText);
  } catch {
    const jsonMatch = cleanText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      let snippet = jsonMatch[0];
      snippet = snippet.replace(/"\s+"/g, '", "');
      snippet = snippet.replace(/"\s*\n\s*"/g, '", "');
      try {
        return JSON.parse(snippet);
      } catch {}
    }
    throw new Error("JSON formatini o'qib bo'lmadi. Iltimos, qayta urinib ko'ring.");
  }
};

export const generateScript = async (topic: string, useSearch: boolean, hookStyle: HookStyle = HookStyle.RANDOM) => {
  // Backend serverless endpoint orqali (Vertex AI, location: global, gemini-3.1-flash-lite)
  try {
    const res = await fetch(`${API_BASE}/generate-script.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, useSearch, hookStyle }),
    });
    if (res.ok) {
      return await res.json();
    }
    // If not OK, try to get error details
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Server ${res.status} xatoligi`);
  } catch (backendErr: any) {
    console.error("Backend /api/generate-script.js error:", backendErr);
    throw backendErr;
  }
};

export const generateAudio = async (text: string, voiceType: VoiceType): Promise<string> => {
  // Backend serverless endpoint orqali (gemini-3.1-flash-tts-preview)
  try {
    const res = await fetch(`${API_BASE}/generate-audio.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceName: "Kore" }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.audio || "";
    }
  } catch (err) {
    console.warn("Backend TTS unavailable:", err);
  }
  return "";
};

export const generateImages = async (prompts: string[], topic?: string): Promise<string[]> => {
  // Backend serverless endpoint orqali (gemini-2.5-flash-image, 4 xil uslub).
  // `topic` yuborilsa, birinchi kadr shu ismning oltin tipografiyasi bo'ladi.
  try {
    const res = await fetch(`${API_BASE}/generate-images.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompts, topic }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.images && data.images.length > 0) return data.images;
    }
  } catch (err) {
    console.warn("Backend image generation unavailable:", err);
  }
  return [];
};

export type AlignedWord = { start: number; end: number } | null;

// TTS returns raw 16-bit mono PCM at 24kHz.
const PCM_BYTES_PER_SECOND = 24000 * 2;
// Synchronous recognition caps out near a minute, and the whole narration (~5MB of PCM) is far
// past the request body limit, so it goes up in pieces.
const ALIGN_CHUNK_SECONDS = 40;

// Uzbek writes the apostrophe several ways (' ʼ ‘ ’ `) and the recogniser adds its own
// capitalisation and punctuation, so both sides are flattened before comparing.
const normaliseWord = (word: string) =>
  word
    .toLowerCase()
    .replace(/[’‘ʼ`´]/g, "'")
    .replace(/[^\p{L}\p{N}']/gu, "")
    .trim();

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const step = 0x8000; // chunked so the argument list stays within engine limits
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
};

// Cut on the quietest 20ms window near the boundary so a word is less likely to be split.
const findQuietSplit = (bytes: Uint8Array, targetByte: number): number => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const window = Math.floor(0.02 * PCM_BYTES_PER_SECOND) & ~1;
  const search = 2 * PCM_BYTES_PER_SECOND;
  const from = Math.max(0, targetByte - search);
  const to = Math.min(bytes.length - window, targetByte + search);
  if (to <= from) return targetByte;

  let best = targetByte;
  let bestEnergy = Infinity;
  for (let pos = from; pos < to; pos += window) {
    let energy = 0;
    for (let i = pos; i < pos + window; i += 2) energy += Math.abs(view.getInt16(i, true));
    if (energy < bestEnergy) {
      bestEnergy = energy;
      best = pos;
    }
  }
  return best & ~1;
};

type HeardWord = { word: string; start: number; end: number };

// Greedy match with lookahead: the recogniser is accurate but drops, merges and respells the
// odd word, so anything unmatched inside the window is left for interpolation.
const alignToScript = (scriptWords: string[], heard: HeardWord[]): AlignedWord[] => {
  const timings: AlignedWord[] = new Array(scriptWords.length).fill(null);
  const LOOKAHEAD = 6;
  let h = 0;

  for (let s = 0; s < scriptWords.length && h < heard.length; s++) {
    const target = normaliseWord(scriptWords[s]);
    if (!target) continue;
    for (let k = 0; k < LOOKAHEAD && h + k < heard.length; k++) {
      const spoken = normaliseWord(heard[h + k].word);
      if (!spoken) continue;
      if (spoken === target || spoken.includes(target) || target.includes(spoken)) {
        timings[s] = { start: heard[h + k].start, end: heard[h + k].end };
        h = h + k + 1;
        break;
      }
    }
  }

  // Spread the surrounding known times evenly across each untimed run.
  let lastKnown = -1;
  for (let i = 0; i <= timings.length; i++) {
    if (i === timings.length || timings[i]) {
      const gap = i - lastKnown - 1;
      if (gap > 0) {
        const from = lastKnown >= 0 ? timings[lastKnown]!.end : 0;
        const to = i < timings.length ? timings[i]!.start : from + gap * 0.35;
        const step = (to - from) / gap;
        for (let g = 0; g < gap; g++) {
          timings[lastKnown + 1 + g] = { start: from + step * g, end: from + step * (g + 1) };
        }
      }
      lastKnown = i;
    }
  }

  return timings;
};

// Real word timings from Speech-to-Text, so captions land on the spoken word instead of being
// estimated from character counts. Returns null on any failure — the player then falls back to
// its own estimate, so a video is never blocked on this.
export const alignSubtitles = async (
  audio: string,
  segments: string[]
): Promise<AlignedWord[][] | null> => {
  if (!audio || !segments.length) return null;

  try {
    const pcm = base64ToBytes(audio);
    const chunkBytes = ALIGN_CHUNK_SECONDS * PCM_BYTES_PER_SECOND;

    const pieces: { data: string; offsetSec: number }[] = [];
    let start = 0;
    while (start < pcm.length) {
      const target = start + chunkBytes;
      const end = target >= pcm.length ? pcm.length : findQuietSplit(pcm, target);
      pieces.push({
        data: bytesToBase64(pcm.subarray(start, end)),
        offsetSec: start / PCM_BYTES_PER_SECOND,
      });
      start = end;
    }

    const results = await Promise.all(
      pieces.map(async ({ data, offsetSec }) => {
        const res = await fetch(`${API_BASE}/align-subtitles.js`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioChunk: data, offsetSec }),
        });
        if (!res.ok) return [] as HeardWord[];
        const json = await res.json();
        return (json.words || []) as HeardWord[];
      })
    );

    const heard = results.flat().sort((a, b) => a.start - b.start);
    if (!heard.length) return null;

    const perSegment = segments.map((s) => s.split(/\s+/).filter(Boolean));
    const flat = perSegment.flat();
    const timings = alignToScript(flat, heard);

    let cursor = 0;
    return perSegment.map((words) => {
      const slice = timings.slice(cursor, cursor + words.length);
      cursor += words.length;
      return slice;
    });
  } catch (err) {
    console.warn("Subtitle alignment unavailable:", err);
    return null;
  }
};

export type NameArtResult = { ok: boolean; image?: string; label?: string; quota?: boolean };

// One concept per call. The endpoint deliberately renders a single artwork rather than a set —
// the image quota is per-minute and the function has a 60s ceiling, so the ten concepts are
// walked one request at a time from here.
export const generateNameArt = async (
  name: string,
  gender: string,
  conceptIndex: number
): Promise<NameArtResult> => {
  try {
    const res = await fetch(`${API_BASE}/generate-name-art.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gender, conceptIndex }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.image) return { ok: true, image: data.image, label: data.label };
    }
    return { ok: false, quota: res.status === 429 };
  } catch (err) {
    console.warn("Name art generation unavailable:", err);
    return { ok: false, quota: false };
  }
};

export const findImages = async (topic: string): Promise<string[]> => {
  // Backend serverless endpoint orqali (Google Search grounding)
  try {
    const res = await fetch(`${API_BASE}/generate-images.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Deliberately no reference to the name itself — image models spell it as garbled
      // glyphs, and the name is already carried by the subtitles.
      body: JSON.stringify({ prompts: [
        `Golden light reflecting on polished marble, warm luxurious atmosphere, 8k cinematic`,
        `Cosmic starry sky, ethereal nebula, deep indigo and violet tones`,
        `Magical forest clearing, emerald and sapphire light beams through trees`,
        `Warm sunset golden hour over calm landscape, dreamlike pastel tones`,
      ]}),
    });
    if (res.ok) {
      const data = await res.json();
      return data.images || [];
    }
  } catch {}
  return [];
};

export const generateTopicIdeas = async (category: string): Promise<string[]> => {
  // Backend serverless endpoint orqali (gemini-3.1-flash-lite)
  try {
    const res = await fetch(`${API_BASE}/generate-topics.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.names || [];
    }
  } catch {}
  return ["Muhammad", "Ali", "Madina", "Rayhona", "Umar", "Imron", "Safiya", "Yasmina"];
};
