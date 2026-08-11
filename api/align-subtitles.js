import { getVertexAI, setCors } from "./_helpers.js";
import { GoogleAuth } from "google-auth-library";

// Speech-to-Text V2. Uzbek is only available on the chirp family, and chirp_2 is the one that
// returns word timings — verified against the live API, which also rules out the v1 endpoint
// and the `global` location (its first word comes back with no offset at all).
const STT_REGION = "us-central1";
const STT_MODEL = "chirp_2";
const LANGUAGE = "uz-UZ";

// TTS returns raw 16-bit mono PCM at 24kHz.
const SAMPLE_RATE = 24000;
const BYTES_PER_SECOND = SAMPLE_RATE * 2;
// Synchronous recognize tops out around a minute of audio, so a ~110s narration is split first.
const CHUNK_SECONDS = 50;

// Uzbek text uses several apostrophe glyphs interchangeably (' ʼ ‘ ’ `), and the recogniser
// capitalises and punctuates on its own. Normalise both sides before comparing.
const normalise = (word) =>
  String(word)
    .toLowerCase()
    .replace(/[’‘ʼ`´]/g, "'")
    .replace(/[^\p{L}\p{N}']/gu, "")
    .trim();

// Split on the quietest point near each boundary so a word is less likely to be cut in half.
function findQuietSplit(buf, targetByte) {
  const window = Math.floor(0.02 * BYTES_PER_SECOND) & ~1; // 20ms, keep sample-aligned
  const search = 2 * BYTES_PER_SECOND;
  const from = Math.max(0, targetByte - search);
  const to = Math.min(buf.length - window, targetByte + search);
  if (to <= from) return targetByte;

  let best = targetByte;
  let bestEnergy = Infinity;
  for (let pos = from; pos < to; pos += window) {
    let energy = 0;
    for (let i = pos; i < pos + window; i += 2) energy += Math.abs(buf.readInt16LE(i));
    if (energy < bestEnergy) {
      bestEnergy = energy;
      best = pos;
    }
  }
  return best & ~1;
}

function splitPcm(buf) {
  const chunkBytes = CHUNK_SECONDS * BYTES_PER_SECOND;
  if (buf.length <= chunkBytes) return [{ buf, offsetSec: 0 }];

  const parts = [];
  let start = 0;
  while (start < buf.length) {
    const target = start + chunkBytes;
    const end = target >= buf.length ? buf.length : findQuietSplit(buf, target);
    parts.push({ buf: buf.subarray(start, end), offsetSec: start / BYTES_PER_SECOND });
    start = end;
  }
  return parts;
}

const parseOffset = (value) => (typeof value === "string" ? parseFloat(value.replace("s", "")) : 0) || 0;

async function recognise(client, project, audioBase64) {
  const res = await client.request({
    url: `https://${STT_REGION}-speech.googleapis.com/v2/projects/${project}/locations/${STT_REGION}/recognizers/_:recognize`,
    method: "POST",
    data: {
      config: {
        model: STT_MODEL,
        languageCodes: [LANGUAGE],
        features: { enableWordTimeOffsets: true },
        explicitDecodingConfig: { encoding: "LINEAR16", sampleRateHertz: SAMPLE_RATE, audioChannelCount: 1 },
      },
      content: audioBase64,
    },
  });
  return (res.data.results || []).flatMap((r) => r.alternatives?.[0]?.words || []);
}

// Greedy alignment with lookahead. The recogniser is accurate but not perfect: it drops words,
// merges them, or spells them differently, so a script word that finds no match inside the
// lookahead window is left untimed and interpolated afterwards.
function alignWords(scriptWords, heardWords) {
  const timings = new Array(scriptWords.length).fill(null);
  const LOOKAHEAD = 6;
  let h = 0;

  for (let s = 0; s < scriptWords.length && h < heardWords.length; s++) {
    const target = normalise(scriptWords[s]);
    if (!target) continue;

    for (let k = 0; k < LOOKAHEAD && h + k < heardWords.length; k++) {
      const heard = normalise(heardWords[h + k].word);
      if (!heard) continue;
      // Exact match, or one contains the other (the recogniser splits and joins compounds).
      if (heard === target || heard.includes(target) || target.includes(heard)) {
        timings[s] = { start: heardWords[h + k].start, end: heardWords[h + k].end };
        h = h + k + 1;
        break;
      }
    }
  }

  // Fill gaps by spreading the surrounding known times evenly across the untimed run.
  let lastKnown = -1;
  for (let i = 0; i <= timings.length; i++) {
    if (i === timings.length || timings[i]) {
      const gap = i - lastKnown - 1;
      if (gap > 0) {
        const from = lastKnown >= 0 ? timings[lastKnown].end : 0;
        const to = i < timings.length ? timings[i].start : from + gap * 0.35;
        const step = (to - from) / gap;
        for (let g = 0; g < gap; g++) {
          timings[lastKnown + 1 + g] = { start: from + step * g, end: from + step * (g + 1) };
        }
      }
      lastKnown = i;
    }
  }

  return timings;
}

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { audio, segments } = req.body || {};
    if (!audio || !Array.isArray(segments) || !segments.length) {
      return res.status(400).json({ error: "audio va segments maydonlari kerak" });
    }

    // Reuse the same service account the rest of the pipeline authenticates with.
    getVertexAI();
    const privateKey = (process.env.GCP_PRIVATE_KEY || "").replace(/\r/g, "").replace(/\\n/g, "\n");
    const auth = new GoogleAuth({
      credentials: { client_email: process.env.GCP_CLIENT_EMAIL, private_key: privateKey },
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const client = await auth.getClient();
    const project = process.env.GCP_PROJECT_ID;

    const pcm = Buffer.from(audio, "base64");
    const parts = splitPcm(pcm);

    const heard = (
      await Promise.all(
        parts.map(async ({ buf, offsetSec }) => {
          const words = await recognise(client, project, buf.toString("base64"));
          return words.map((w) => ({
            word: w.word,
            start: parseOffset(w.startOffset) + offsetSec,
            end: parseOffset(w.endOffset) + offsetSec,
          }));
        })
      )
    ).flat();

    if (!heard.length) return res.status(200).json({ aligned: false, reason: "NO_WORDS" });

    // Flatten the script so word timings can be handed back grouped per segment.
    const perSegment = segments.map((s) => String(s).split(/\s+/).filter(Boolean));
    const flat = perSegment.flat();
    const timings = alignWords(flat, heard);

    let cursor = 0;
    const grouped = perSegment.map((words) => {
      const slice = timings.slice(cursor, cursor + words.length);
      cursor += words.length;
      return slice;
    });

    const matched = timings.filter(Boolean).length;
    return res.status(200).json({
      aligned: true,
      segments: grouped,
      heardWordCount: heard.length,
      scriptWordCount: flat.length,
      matchedRatio: flat.length ? matched / flat.length : 0,
    });
  } catch (err) {
    const detail = err?.response?.data?.error?.message || err.message || "";
    console.error("align-subtitles error:", detail.slice(0, 200));
    // Never block a video on alignment — the player falls back to its own estimate.
    return res.status(200).json({ aligned: false, reason: detail.slice(0, 120) });
  }
}
