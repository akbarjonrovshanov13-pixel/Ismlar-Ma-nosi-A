import { getVertexAI, setCors } from "./_helpers.js";

// Ten separate premium name-art directions. Each call renders ONE concept as a standalone
// 9:16 artwork — never a grid or contact sheet — so the client walks the list one request at
// a time. Batching them server-side is not an option: the image quota is per-minute and the
// function has a 60s ceiling (see generate-images.js).
const CONCEPTS = [
  { id: "royal", label: "Royal Luxury", art: "deep charcoal-black background, elegant polished gold typography, restrained regal geometry, high-end luxury lighting, sophisticated and understated" },
  { id: "nature", label: "Nature Integrated", art: "letters physically built from moss, stone and wood in a photorealistic forest clearing, golden-hour light, deep natural realism" },
  { id: "cosmic", label: "Cosmic", art: "deep space with stars and a soft nebula, letters in luminous chrome and glass, epic but refined, cool celestial glow" },
  { id: "urban", label: "Urban Premium", art: "cinematic modern city at night, wet reflective streets and glass architecture, letters integrated into the environment, ambitious polished mood" },
  { id: "minimal", label: "Minimal Luxury", art: "very clean composition, neutral dark premium backdrop, huge embossed matte stone letters, strong controlled shadows, minimal and expensive" },
  { id: "floral", label: "Floral Elegant", art: "letters interwoven with realistic fresh flowers, leaves, pearl and silk, graceful composition, soft premium lighting" },
  { id: "fire", label: "Fire & Power", art: "letters forged from molten metal with glowing hot edges and drifting sparks, dark dramatic contrast, controlled cinematic fire" },
  { id: "art", label: "Artistic Colour", art: "bold expressive lettering shaped by colour powder explosion and paint splash, energetic street-art texture, professionally composed, letters stay crisp" },
  { id: "crystal", label: "Glass & Crystal", art: "letters cut from clear crystal and faceted gemstones, studio product-photography lighting, elegant reflections and caustics" },
  { id: "symbolic", label: "Symbolic Scene", art: "one symbolic object matching the meaning of the name (a key, moon, mountain path, fountain pen, butterfly or bridge), letters integrated naturally and elegantly into the scene" },
];

// Spelling the name out letter by letter is what makes the model get it right — asked plainly
// for "MALIKA" it renders "MAUKA". Kept deliberately short on negatives: a long "no text, no
// letters, no words…" list makes the model return a response with no image at all.
const buildPrompt = (name, gender, concept) => {
  const clean = String(name).trim().toUpperCase().slice(0, 20);
  const letters = clean.split("").join("-");
  const tone = gender === "FEMALE" ? "graceful feminine" : gender === "MALE" ? "strong masculine" : "balanced";
  // "Written across a single horizontal line" matters: in a 9:16 frame the model otherwise
  // stacks the letters one per row, which reads as a column rather than a wordmark.
  return `Premium vertical name-art poster. The word ${letters} (spelled "${clean}", ${clean.length} letters, Latin alphabet) is the hero of the image, written across ONE single horizontal line in the middle of the frame, large and clearly readable, every letter distinct and unobstructed. Style: ${concept.art}. Overall tone ${tone}, art-directed, cinematic colour grading, realistic materials. One single standalone artwork filling the frame, not a collage or grid. The only text is ${clean}.`;
};

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
      contents: [{ role: "user", parts: [{ text: buildPrompt(name, gender, concept) }] }],
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
