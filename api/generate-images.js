import { getVertexAI, executeWithQuotaFallback, fetchPollinationsImage, getCachedImage, setCachedImage, setCors } from "./_helpers.js";

// Same-origin fallback (used only if both Vertex AI and Pollinations AI fail) —
// Cinematic 9:16 vertical aesthetic scene wallpapers
const HD_WALLPAPERS = [
  "/fallback/scene-1.jpg",
  "/fallback/scene-2.jpg",
  "/fallback/scene-3.jpg",
  "/fallback/scene-4.jpg",
];

const nameHeroPrompt = (name) => {
  const clean = String(name).trim().toUpperCase().slice(0, 20);
  return `Vertical 9:16 smartphone wallpaper. A masterpiece 3D luxury typographic sculpture spelling the exact word "${clean}". Massive dimensional Latin letters with beveled edges, sculpted from polished 24k gold with platinum reflections, centered majestically on a reflective black obsidian pedestal. Dramatic cinematic volumetric studio lighting, warm rim lights, dark elegant background, Octane render 8k, photorealistic masterpiece. The only text visible in the entire image is "${clean}".`;
};

// 4 distinct narrative-aligned scene enhancers for the video story:
// 0: Majestic Identity / Subject
// 1: Secret Psychology & Hidden Depths
// 2: Warmth, Love & Emotional Resonance
// 3: Destiny, Power & Timeless Legacy
const SCENE_ENHANCERS = [
  (p) => `Vertical 9:16 smartphone wallpaper. ${p}. Cinematic luxury aesthetic, dramatic rim lighting, majestic composition, 8k resolution, photorealistic, no text, no letters, no words.`,
  (p) => `Vertical 9:16 smartphone wallpaper. ${p}. Enigmatic and atmospheric scene, deep volumetric moody lighting, ethereal haze, rich color palette, cinematic mystery, 8k resolution, photorealistic, no text, no letters, no words.`,
  (p) => `Vertical 9:16 smartphone wallpaper. ${p}. Warm golden hour lighting, gentle glowing ambient light, emotional and poetic atmosphere, soft bokeh, delicate beauty, 8k resolution, photorealistic, no text, no letters, no words.`,
  (p) => `Vertical 9:16 smartphone wallpaper. ${p}. Epic grand scale vista, majestic horizon, triumphant cinematic lighting, timeless strength and nobility, ultra-detailed 8k masterpiece, no text, no letters, no words.`
];

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { prompts, topic } = req.body || {};
    const validPrompts = (prompts && prompts.length > 0) ? prompts.filter((p) => p?.trim().length > 0).slice(0, 4) : ["Ism"];

    const heroIndex = topic && String(topic).trim() ? 0 : -1;

    let aiAvailable = true;
    try {
      getVertexAI();
    } catch (err) {
      console.warn("Vertex AI unavailable, will rely on Pollinations AI fallback:", err.message);
      aiAvailable = false;
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const generateOne = async (p, index) => {
      const enhanced = index === heroIndex
        ? nameHeroPrompt(topic)
        : SCENE_ENHANCERS[index % SCENE_ENHANCERS.length](p);

      // Check cache first to avoid redundant API calls
      const cacheKey = index === heroIndex ? `hero:${String(topic).trim().toUpperCase()}` : `scene:${index}:${enhanced}`;
      const cached = getCachedImage(cacheKey);
      if (cached) {
        console.log(`Using cached image for prompt index ${index}`);
        return cached;
      }

      // Execute with multi-region quota fallback using verified gemini-2.5-flash-image
      const response = await executeWithQuotaFallback(
        async (ai, loc, modelToUse) => {
          return await ai.models.generateContent({
            model: modelToUse,
            contents: [{ role: "user", parts: [{ text: enhanced }] }],
            config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "9:16" } },
          });
        },
        ["gemini-2.5-flash-image"]
      );

      const part = response.candidates?.[0]?.content?.parts?.find((partItem) => partItem.inlineData);
      if (!part?.inlineData?.data) throw new Error("Rasm ma'lumoti topilmadi");
      
      const imgData = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      setCachedImage(cacheKey, imgData);
      return imgData;
    };

    const isQuotaError = (err) => /429|RESOURCE_EXHAUSTED|Quota exceeded/i.test(err?.message || "");
    const RETRY_BACKOFF_MS = [1000, 2000];
    let isBatchQuotaExhausted = false;

    const images = [];
    for (let index = 0; index < validPrompts.length; index++) {
      const p = validPrompts[index];
      let generated = null;

      if (aiAvailable && !isBatchQuotaExhausted) {
        if (index > 0) {
          await sleep(500);
        }

        for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
          try {
            generated = await generateOne(p, index);
            break;
          } catch (err) {
            const last = attempt === RETRY_BACKOFF_MS.length;
            if (isQuotaError(err)) {
              console.warn(`Gemini image quota exhausted across regions for prompt ${index}, using Pollinations AI fallback:`, err.message);
              isBatchQuotaExhausted = true;
              break;
            }
            if (last) {
              console.warn(`Gemini image generation failed for prompt ${index}, using Pollinations AI fallback:`, err.message);
              break;
            }
            console.warn(`Gemini image generation failed for prompt ${index}, retrying...`, err.message);
            await sleep(RETRY_BACKOFF_MS[attempt]);
          }
        }
      }

      // If Vertex AI did not produce an image, try Pollinations AI before static wallpapers
      if (!generated) {
        console.log(`Generating prompt ${index} using Pollinations AI fallback...`);
        const enhanced = index === heroIndex
          ? nameHeroPrompt(topic)
          : SCENE_ENHANCERS[index % SCENE_ENHANCERS.length](p);

        const pollinationsImg = await fetchPollinationsImage(enhanced, 768, 1344);
        if (pollinationsImg) {
          generated = pollinationsImg;
          const cacheKey = index === heroIndex ? `hero:${String(topic).trim().toUpperCase()}` : `scene:${index}:${enhanced}`;
          setCachedImage(cacheKey, pollinationsImg);
        }
      }

      images.push(generated || HD_WALLPAPERS[index % HD_WALLPAPERS.length]);
    }

    return res.status(200).json({ images });
  } catch (err) {
    console.error("generate-images error:", err);
    res.status(500).json({ error: err.message || "Rasm xatoligi" });
  }
}
