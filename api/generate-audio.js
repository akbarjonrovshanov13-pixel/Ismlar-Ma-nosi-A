import { getVertexAI, setCors } from "./_helpers.js";

const VOICE_MAP = {
  FRIENDLY: "Kore",
  SERIOUS: "Fenrir",
  ENERGETIC: "Puck",
  CALM: "Charon",
  PROFESSIONAL: "Aoede",
};

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { text, voiceType } = req.body || {};
    if (!text) return res.status(400).json({ error: "text maydoni kerak" });

    const ai = getVertexAI();
    const voiceName = VOICE_MAP[voiceType] || "Kore";

    const models = ["gemini-2.5-flash"];
    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model: model,
          contents: [{ parts: [{ text: text || "Matn topilmadi." }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          },
        });

        const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64) return res.status(200).json({ audio: base64 });
      } catch (e) {
        console.warn("Vertex AI Audio output not supported or allowlisted:", e.message);
      }
    }
    // Return empty audio gracefully so the app does not crash
    return res.status(200).json({ audio: "" });
  } catch (err) {
    console.error("generate-audio error:", err);
    res.status(500).json({ error: err.message || "Audio xatoligi" });
  }
}
