import { getVertexAI, setCors } from "./_helpers.js";

const FALLBACK_WALLPAPERS = [
  "https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?auto=format&fit=crop&w=1080&h=1920&q=80",
  "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1080&h=1920&q=80",
  "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=1080&h=1920&q=80",
  "https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=1080&h=1920&q=80",
];

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { prompts } = req.body || {};
    if (!prompts?.length) return res.status(400).json({ error: "prompts maydoni kerak" });

    const ai = getVertexAI();
    const validPrompts = prompts.filter((p) => p?.trim().length > 0).slice(0, 4);

    const results = await Promise.all(
      validPrompts.map(async (p, index) => {
        const enhanced = `${p}, masterpiece, highly detailed 8k photography, 9:16 vertical aspect ratio, cinematic volumetric lighting, vivid vibrant colors, photorealistic rendering`;
        try {
          const response = await ai.models.generateContent({
            model: "imagen-4.0-generate-001",
            contents: { parts: [{ text: enhanced }] },
            config: { numberOfImages: 1, aspectRatio: "9:16" },
          });
          const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
          if (part?.inlineData?.data) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          }
        } catch (e) {
          console.warn(`Imagen failed for prompt ${index}:`, e.message);
        }
        // Fallback to high quality 9:16 HD vertical images
        const fallbackUrl = FALLBACK_WALLPAPERS[index % FALLBACK_WALLPAPERS.length];
        return fallbackUrl;
      })
    );

    res.status(200).json({ images: results.filter(Boolean) });
  } catch (err) {
    console.error("generate-images error:", err);
    res.status(500).json({ error: err.message || "Rasm xatoligi" });
  }
}
