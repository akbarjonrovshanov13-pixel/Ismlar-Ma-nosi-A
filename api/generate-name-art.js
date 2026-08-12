import { getVertexAI, setCors } from "./_helpers.js";
import { NAME_ART_CONCEPTS as CONCEPTS, buildNameArtPrompt } from "../nameArtConcepts.js";

// Each call renders ONE concept as a standalone 9:16 artwork — never a grid or contact sheet —
// so the client walks the list one request at a time. Batching them server-side is not an
// option: the image quota is per-minute and the function has a 60s ceiling (see
// generate-images.js).

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    return res.status(200).json({ concepts: CONCEPTS.map(({ id, label }) => ({ id, label })) });
  }

  try {
    const { name, gender, conceptIndex } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: "name maydoni kerak" });

    const index = Number.isInteger(conceptIndex) ? conceptIndex : 0;
    const concept = CONCEPTS[index];
    if (!concept) return res.status(400).json({ error: "conceptIndex 0..9 oralig'ida bo'lishi kerak" });

    let ai;
    try {
      ai = getVertexAI();
    } catch (err) {
      console.warn("Vertex AI unavailable for name art:", err.message);
      return res.status(503).json({ error: "AI xizmati sozlanmagan", conceptId: concept.id });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [{ role: "user", parts: [{ text: buildNameArtPrompt(name, gender, concept) }] }],
      config: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: "9:16" } },
    });

    const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part?.inlineData?.data) {
      // Quota rejections surface here too; the client decides whether to retry this concept.
      return res.status(502).json({ error: "Rasm yaratilmadi", conceptId: concept.id, label: concept.label });
    }

    return res.status(200).json({
      image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
      conceptId: concept.id,
      label: concept.label,
      index,
    });
  } catch (err) {
    const quota = /429|RESOURCE_EXHAUSTED/i.test(err?.message || "");
    console.error("generate-name-art error:", err.message);
    return res.status(quota ? 429 : 500).json({ error: quota ? "QUOTA" : (err.message || "Rasm xatoligi") });
  }
}
