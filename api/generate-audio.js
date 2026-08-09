import { getVertexAI, retry, setCors } from "./_helpers.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { text, voiceName } = req.body || {};
    if (!text) return res.status(400).json({ error: "text maydoni kerak" });

    const ai = getVertexAI(); // location: "global" — gemini-3.1-flash-tts-preview ishlaydi
    const voice = voiceName || "Kore";
    const safeText = text || "Matn topilmadi.";

    const response = await retry(() => ai.models.generateContent({
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
    }));

    const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64) return res.status(500).json({ error: "Audio generate qilinmadi" });

    const mimeType = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType || "audio/L16;codec=pcm;rate=24000";
    res.status(200).json({ audio: base64, mimeType });
  } catch (err) {
    console.error("generate-audio error:", err);
    res.status(500).json({ error: err.message || "Audio xatoligi" });
  }
}
