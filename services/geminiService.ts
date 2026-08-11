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

// Real word timings from Speech-to-Text, so captions land on the spoken word instead of being
// estimated from character counts. Returns null on any failure — the player then falls back to
// its own estimate, so a video is never blocked on this.
export const alignSubtitles = async (
  audio: string,
  segments: string[]
): Promise<AlignedWord[][] | null> => {
  if (!audio || !segments.length) return null;
  try {
    const res = await fetch(`${API_BASE}/align-subtitles.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio, segments }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.aligned && Array.isArray(data.segments)) return data.segments;
  } catch (err) {
    console.warn("Subtitle alignment unavailable:", err);
  }
  return null;
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
