import { getVertexAI, retry, setCors } from "./_helpers.js";

// VideoPlayer audioBase64="" holatini xavfsiz qo'llab-quvvatlaydi (ovozsiz video) —
// shuning uchun ohirgi chora sifatida har doim 200 + bo'sh audio qaytariladi,
// audio yo'qligi butun video generatsiyasini to'xtatib qo'ymasin.
const SILENT_FALLBACK = { audio: "", mimeType: "" };
const TTS_MODEL = "gemini-3.1-flash-tts-preview";
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

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { text, voiceName } = req.body || {};
    if (!text) return res.status(400).json({ error: "text maydoni kerak" });

    let ai;
    try {
      ai = getVertexAI();
    } catch (err) {
      console.warn("Vertex AI unavailable for audio, returning silent fallback:", err.message);
      return res.status(200).json(SILENT_FALLBACK);
    }

    const voice = voiceName || "Kore";
    const safeText = text || "Matn topilmadi.";

    const synthesize = (chunkText) => ai.models.generateContent({
      model: TTS_MODEL,
      contents: chunkText,
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
        },
      },
    });

    // Kvota (429 RESOURCE_EXHAUSTED) xatosi retry()ga qamralmaydi (u faqat 500-turini
    // qamraydi) — bitta qo'shimcha urinish beramiz, chunki bu turdagi xato odatda tez tiklanadi.
    const synthesizeWithRetry = async (chunkText) => {
      try {
        return await retry(() => synthesize(chunkText));
      } catch (err) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return await synthesize(chunkText);
      }
    };

    const chunks = safeText.length > CHUNK_THRESHOLD ? splitIntoChunks(safeText, TARGET_CHUNKS) : [safeText];

    let parts;
    try {
      parts = await Promise.all(chunks.map(async (chunk, index) => {
        // Bo'laklarni bir vaqtda emas, ozgina interval bilan yuboramiz — model
        // bir zumdagi parallel so'rovlar to'plamini kvota xatosi bilan rad etishi mumkin.
        await new Promise((resolve) => setTimeout(resolve, index * 300));
        const response = await synthesizeWithRetry(chunk);
        const part = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (!part?.data) throw new Error(`Bo'lak ${index} uchun audio topilmadi`);
        return part;
      }));
    } catch (err) {
      console.warn("generate-audio: bo'lak generatsiyasi muvaffaqiyatsiz, ovozsiz fallback:", err.message);
      return res.status(200).json(SILENT_FALLBACK);
    }

    const mimeType = parts[0]?.mimeType || TTS_MIME_DEFAULT;
    const audio = parts.length === 1
      ? parts[0].data
      : Buffer.concat(parts.map((p) => Buffer.from(p.data, "base64"))).toString("base64");

    res.status(200).json({ audio, mimeType });
  } catch (err) {
    console.error("generate-audio error:", err);
    res.status(200).json(SILENT_FALLBACK);
  }
}
