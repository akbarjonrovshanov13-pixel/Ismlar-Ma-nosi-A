import { getVertexAI, retry, setCors } from "./_helpers.js";

// VideoPlayer audioBase64="" holatini xavfsiz qo'llab-quvvatlaydi (ovozsiz video) —
// shuning uchun ohirgi chora sifatida har doim 200 + bo'sh audio qaytariladi,
// audio yo'qligi butun video generatsiyasini to'xtatib qo'ymasin.
const SILENT_FALLBACK = { audio: "", mimeType: "" };

// Studio-grade & high-throughput latest Gemini TTS models (Released Sep 2026)
const TTS_CANDIDATES = [
  { model: "gemini-3.8-flash-tts", location: "global" },
  { model: "gemini-3.8-flash-tts", location: "us-central1" },
  { model: "gemini-3.8-flash-lite-tts", location: "global" },
  { model: "gemini-3.8-flash-lite-tts", location: "us-central1" },
  { model: "gemini-3.1-flash-tts-preview", location: "global" },
];

const TTS_MIME_DEFAULT = "audio/L16;codec=pcm;rate=24000";
const CHUNK_THRESHOLD = 250; // bundan qisqa matnni bo'lish foyda bermaydi
const TARGET_CHUNKS = 4;

// Uzun matnni gaplar bo'yicha taxminan teng bo'laklarga bo'ladi — har bir bo'lak
// alohida (parallel) sintez qilinadi. Sabab: bitta uzun chaqiruv matn uzunligiga
// deyarli chiziqli proporsional sekinlashadi (o'lchov: ~30 belgi ~3s, ~1400 belgi ~50s),
// parallel bo'laklarga bo'lish esa umumiy kutish vaqtini eng sekin bo'lak vaqtigacha qisqartiradi.
function splitIntoChunks(text, targetChunks) {
  const sentences = text.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) || [text];
  if (sentences.length <= 1) return [text];

  const targetLen = Math.ceil(text.length / targetChunks);
  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > targetLen) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export const maxDuration = 60;
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { text, voiceName } = req.body || {};
    if (!text) return res.status(400).json({ error: "text maydoni kerak" });

    const voice = voiceName || "Kore";
    const safeText = text || "Matn topilmadi.";

    const chunks = safeText.length > CHUNK_THRESHOLD ? splitIntoChunks(safeText, TARGET_CHUNKS) : [safeText];

    let parts = null;
    let successfulModel = null;

    // Try candidates in order: gemini-3.8-flash-tts -> gemini-3.8-flash-lite-tts -> legacy preview
    for (const candidate of TTS_CANDIDATES) {
      try {
        let ai;
        try {
          ai = getVertexAI(candidate.location);
        } catch (e) {
          console.warn(`Vertex AI unavailable for ${candidate.location}:`, e.message);
          continue;
        }

        const synthesize = (chunkText) => ai.models.generateContent({
          model: candidate.model,
          contents: chunkText,
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
            },
          },
        });

        // Kvota (429 RESOURCE_EXHAUSTED) xatosi retry()ga qamralmaydi — bitta qo'shimcha urinish beramiz
        const synthesizeWithRetry = async (chunkText) => {
          try {
            return await retry(() => synthesize(chunkText));
          } catch (err) {
            await new Promise((resolve) => setTimeout(resolve, 800));
            return await synthesize(chunkText);
          }
        };

        const currentParts = await Promise.all(chunks.map(async (chunk, index) => {
          // Bo'laklarni bir vaqtda emas, ozgina interval bilan yuboramiz
          await new Promise((resolve) => setTimeout(resolve, index * 250));
          const response = await synthesizeWithRetry(chunk);
          const part = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
          if (!part?.data) throw new Error(`Bo'lak ${index} uchun audio topilmadi`);
          return part;
        }));

        if (currentParts && currentParts.length === chunks.length) {
          parts = currentParts;
          successfulModel = `${candidate.model} (${candidate.location})`;
          console.log(`TTS audio generated successfully with ${successfulModel}`);
          break;
        }
      } catch (candidateErr) {
        console.warn(`TTS candidate ${candidate.model} (${candidate.location}) failed, trying next:`, candidateErr.message);
      }
    }

    if (!parts) {
      console.warn("generate-audio: barcha TTS modellari muvaffaqiyatsiz, ovozsiz fallback");
      return res.status(200).json(SILENT_FALLBACK);
    }

    const mimeType = parts[0]?.mimeType || TTS_MIME_DEFAULT;
    const audio = parts.length === 1
      ? parts[0].data
      : Buffer.concat(parts.map((p) => Buffer.from(p.data, "base64"))).toString("base64");

    res.status(200).json({ audio, mimeType, model: successfulModel });
  } catch (err) {
    console.error("generate-audio error:", err);
    res.status(200).json(SILENT_FALLBACK);
  }
}
