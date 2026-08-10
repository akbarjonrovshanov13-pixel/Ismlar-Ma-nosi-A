import { getVertexAI, setCors } from "./_helpers.js";

// Same-origin fallback (used only if Vertex AI generation fails for a slot) —
// branded Luxe Core product shots instead of generic stock wallpaper.
const HD_WALLPAPERS = [
  "/fallback/cup.jpg",
  "/fallback/container.jpg",
  "/fallback/clamshell.jpg",
  "/fallback/drink.jpg",
];

// Image models spell text as garbled glyphs, and for Uzbek names they tend to add Arabic
// calligraphy unprompted. The name is carried by the subtitles, never by the image.
// Keep this short: a long negation list ("no text, no letters, no words, no numbers, …")
// makes the model return an empty response with no image part at all.
const NO_TEXT_RULE = ", without any writing or lettering";

const STYLE_SUFFIXES = [
  ", luxurious royal gold and obsidian black marble surfaces, ambient warm glowing light, elegant high-end atmosphere, cinematic lighting, 8k" + NO_TEXT_RULE,
  ", cosmic starry sky, glowing nebula in deep indigo and violet tones, ethereal light flares, bokeh, highly aesthetic, 8k" + NO_TEXT_RULE,
  ", magical forest, glowing emerald and sapphire light beams, sun rays filtering through trees, enchanted mystical atmosphere, extremely photorealistic, 8k" + NO_TEXT_RULE,
  ", cinematic warm sunset golden hour, soft pastel tones, dreamlike atmosphere, highly artistic and elegant background, 8k" + NO_TEXT_RULE,
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
        // Ask the API for 9:16 rather than describing it in the prompt — prompt text alone
        // yields a 1024x1024 square, which the player then crops to fit, cutting away ~44%
        // of the composition. This returns a true 768x1344 vertical frame.
        config: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: "9:16" } },
      });
      const part = response.candidates?.[0]?.content?.parts?.find((partItem) => partItem.inlineData);
      if (!part?.inlineData?.data) throw new Error("Rasm ma'lumoti topilmadi");
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    };

    const images = await Promise.all(validPrompts.map(async (p, index) => {
      if (ai) {
        // Stagger launches — the Vertex image model rejects bursts of simultaneous requests
        // (RESOURCE_EXHAUSTED) even when a single request succeeds instantly.
        await sleep(index * 150);
        try {
          return await generateOne(p, index);
        } catch (err) {
          console.warn(`Gemini image generation failed for prompt ${index}, retrying once:`, err.message);
        }
        try {
          await sleep(400);
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
