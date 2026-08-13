import { getVertexAI, executeWithQuotaFallback, fetchPollinationsImage, getCachedImage, setCachedImage, setCors } from "./_helpers.js";
import { NAME_ART_CONCEPTS as CONCEPTS, buildNameArtPrompt } from "../nameArtConcepts.js";

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

    const cacheKey = `nameart:${String(name).trim().toUpperCase()}:${gender}:${concept.id}`;
    const cached = getCachedImage(cacheKey);
    if (cached) {
      return res.status(200).json({ image: cached, conceptId: concept.id, label: concept.label, index });
    }

    let aiAvailable = true;
    try {
      getVertexAI();
    } catch (err) {
      console.warn("Vertex AI unavailable for name art, attempting Pollinations AI fallback:", err.message);
      aiAvailable = false;
    }

    let imageResult = null;

    if (aiAvailable) {
      try {
        const response = await executeWithQuotaFallback(
          async (ai, loc, modelToUse) => {
            return await ai.models.generateContent({
              model: modelToUse,
              contents: [{ role: "user", parts: [{ text: buildNameArtPrompt(name, gender, concept) }] }],
              config: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: "9:16" } },
            });
          },
          [
            "gemini-2.5-flash-image",
            "gemini-3.1-flash-lite-image",
            "imagen-3.0-generate-002",
            "imagen-3.0-fast-generate-001"
          ]
        );

        const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
        if (part?.inlineData?.data) {
          imageResult = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      } catch (err) {
        console.warn(`Vertex AI failed for name art concept ${concept.id}, attempting Pollinations AI fallback:`, err.message);
      }
    }

    // Fallback to Pollinations AI if Vertex AI fails or is quota-exhausted
    if (!imageResult) {
      const prompt = buildNameArtPrompt(name, gender, concept);
      imageResult = await fetchPollinationsImage(prompt, 768, 1344);
    }

    if (!imageResult) {
      return res.status(502).json({ error: "Rasm yaratilmadi", conceptId: concept.id, label: concept.label });
    }

    setCachedImage(cacheKey, imageResult);

    return res.status(200).json({
      image: imageResult,
      conceptId: concept.id,
      label: concept.label,
      index,
    });
  } catch (err) {
    const quota = /429|RESOURCE_EXHAUSTED|Quota exceeded/i.test(err?.message || "");
    console.error("generate-name-art error:", err.message);
    return res.status(quota ? 429 : 500).json({ error: quota ? "QUOTA" : (err.message || "Rasm xatoligi") });
  }
}
