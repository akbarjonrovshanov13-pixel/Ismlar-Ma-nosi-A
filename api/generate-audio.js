import { getVertexAI, retry, setCors } from "./_helpers.js";

// VideoPlayer audioBase64="" holatini xavfsiz qo'llab-quvvatlaydi (ovozsiz video) —
// shuning uchun ohirgi chora sifatida har doim 200 + bo'sh audio qaytariladi,
// audio yo'qligi butun video generatsiyasini to'xtatib qo'ymasin.
const SILENT_FALLBACK = { audio: "", mimeType: "" };

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

    const attempt = () => ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: safeText,
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    let response;
    try {
      response = await retry(attempt); // 500/overloaded xatolarini qamrab oladi
    } catch (err) {
      // retry() kvota (429 RESOURCE_EXHAUSTED) xatolarini qamramaydi — bunday xatolar
      // odatda bir necha soniyada tiklanadi, shuning uchun bitta qo'shimcha urinish beramiz.
      console.warn("generate-audio birinchi urinish muvaffaqiyatsiz, qayta urinilmoqda:", err.message);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        response = await attempt();
      } catch (err2) {
        console.warn("generate-audio qayta urinish ham muvaffaqiyatsiz, ovozsiz fallback:", err2.message);
        return res.status(200).json(SILENT_FALLBACK);
      }
    }

    const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64) return res.status(200).json(SILENT_FALLBACK);

    const mimeType = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType || "audio/L16;codec=pcm;rate=24000";
    res.status(200).json({ audio: base64, mimeType });
  } catch (err) {
    console.error("generate-audio error:", err);
    res.status(200).json(SILENT_FALLBACK);
  }
}
