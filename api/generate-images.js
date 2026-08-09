import { getVertexAI, setCors } from "./_helpers.js";

// CORS-safe fallback (used only if Vertex AI generation fails for a slot)
const HD_WALLPAPERS = [
  "https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?auto=format&fit=crop&w=1080&h=1920&q=80", // Royal Gold Obsidian
  "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1080&h=1920&q=80", // Cosmic Space Nebula
  "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=1080&h=1920&q=80", // Emerald Fantasy Forest
  "https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=1080&h=1920&q=80", // Warm Sunset Golden Hour
];

const STYLE_SUFFIXES = [
  ", luxurious royal gold style, glowing gold typography on obsidian black marble, ambient warm glowing lights, elegant and high-end atmosphere, cinematic lighting, 8k, vertical 9:16 aspect ratio",
  ", cosmic starry sky style, glowing neon nebula background, deep indigo and violet space tones, ethereal light flares, bokeh, highly aesthetic, 8k, vertical 9:16 aspect ratio",
  ", magical fantasy forest style, glowing emerald and sapphire light beams, sun rays filtering through trees, enchanted mystical atmosphere, extremely photorealistic, 8k, vertical 9:16 aspect ratio",
  ", cinematic emotional portrait style, warm sunset golden hour, soft light pastel tones, dreamlike atmosphere, highly artistic and elegant background, 8k, vertical 9:16 aspect ratio",
];

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { prompts } = req.body || {};
    const validPrompts = (prompts && prompts.length > 0) ? prompts.filter((p) => p?.trim().length > 0).slice(0, 4) : ["Ism"];

    let ai = null;
    try {
      ai = getVertexAI();
    } catch (err) {
      console.warn("Vertex AI unavailable, using wallpaper fallback:", err.message);
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const generateOne = async (p, index) => {
      const enhanced = p + STYLE_SUFFIXES[index % STYLE_SUFFIXES.length];
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [{ role: "user", parts: [{ text: enhanced }] }],
        config: { responseModalities: ["IMAGE", "TEXT"] },
      });
      const part = response.candidates?.[0]?.content?.parts?.find((partItem) => partItem.inlineData);
      if (!part?.inlineData?.data) throw new Error("Rasm ma'lumoti topilmadi");
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    };

    const images = await Promise.all(validPrompts.map(async (p, index) => {
      if (ai) {
        // Stagger launches — the Vertex image model rejects bursts of simultaneous requests
        // (RESOURCE_EXHAUSTED) even when a single request succeeds instantly.
        await sleep(index * 350);
        try {
          return await generateOne(p, index);
        } catch (err) {
          console.warn(`Gemini image generation failed for prompt ${index}, retrying once:`, err.message);
        }
        try {
          await sleep(800);
          return await generateOne(p, index);
        } catch (err) {
          console.warn(`Gemini image generation retry failed for prompt ${index}, using wallpaper fallback:`, err.message);
        }
      }
      return HD_WALLPAPERS[index % HD_WALLPAPERS.length];
    }));

    return res.status(200).json({ images });
  } catch (err) {
    console.error("generate-images error:", err);
    res.status(500).json({ error: err.message || "Rasm xatoligi" });
  }
}
