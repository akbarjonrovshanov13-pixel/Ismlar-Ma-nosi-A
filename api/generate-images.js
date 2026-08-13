import { getVertexAI, executeWithQuotaFallback, fetchPollinationsImage, getCachedImage, setCachedImage, setCors } from "./_helpers.js";

// Same-origin fallback (used only if both Vertex AI and Pollinations AI fail) —
// branded Luxe Core product shots instead of generic stock wallpaper.
const HD_WALLPAPERS = [
  "/fallback/cup.jpg",
  "/fallback/container.jpg",
  "/fallback/clamshell.jpg",
  "/fallback/drink.jpg",
];

const NO_TEXT_RULE = ", without any writing or lettering";

const nameHeroPrompt = (name) => {
  const clean = String(name).trim().toUpperCase().slice(0, 20);
  const letters = clean.split("").join("-");
  return `3D golden metallic capital letters arranged to spell ${letters} (the word "${clean}", ${clean.length} letters), Latin alphabet, resting on polished obsidian black marble, warm cinematic lighting, luxurious and elegant, 8k. Render exactly these ${clean.length} letters and nothing else, no other writing.`;
};

const STYLE_SUFFIXES = [
  ", luxurious royal gold and obsidian black marble surfaces, ambient warm glowing light, elegant high-end atmosphere, cinematic lighting, 8k" + NO_TEXT_RULE,
  ", cosmic starry sky, glowing nebula in deep indigo and violet tones, ethereal light flares, bokeh, highly aesthetic, 8k" + NO_TEXT_RULE,
  ", magical forest, glowing emerald and sapphire light beams, sun rays filtering through trees, enchanted mystical atmosphere, extremely photorealistic, 8k" + NO_TEXT_RULE,
  ", cinematic warm sunset golden hour, soft pastel tones, dreamlike atmosphere, highly artistic and elegant background, 8k" + NO_TEXT_RULE,
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
        : p + STYLE_SUFFIXES[index % STYLE_SUFFIXES.length];

      // Check cache first to avoid redundant API calls
      const cacheKey = index === heroIndex ? `hero:${String(topic).trim().toUpperCase()}` : `style:${index}:${enhanced}`;
      const cached = getCachedImage(cacheKey);
      if (cached) {
        console.log(`Using cached image for prompt index ${index}`);
        return cached;
      }

      // Execute with multi-model and multi-region quota fallback
      const response = await executeWithQuotaFallback(
        async (ai, loc, modelToUse) => {
          return await ai.models.generateContent({
            model: modelToUse,
            contents: [{ role: "user", parts: [{ text: enhanced }] }],
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
          : p + STYLE_SUFFIXES[index % STYLE_SUFFIXES.length];

        const pollinationsImg = await fetchPollinationsImage(enhanced, 768, 1344);
        if (pollinationsImg) {
          generated = pollinationsImg;
          const cacheKey = index === heroIndex ? `hero:${String(topic).trim().toUpperCase()}` : `style:${index}:${enhanced}`;
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
