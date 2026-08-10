import { getVertexAI, setCors } from "./_helpers.js";

// Same-origin fallback (used only if Vertex AI generation fails for a slot) —
// branded Luxe Core product shots instead of generic stock wallpaper.
const HD_WALLPAPERS = [
  "/fallback/cup.jpg",
  "/fallback/container.jpg",
  "/fallback/clamshell.jpg",
  "/fallback/drink.jpg",
];

// Backgrounds stay free of writing — asked for text they produce garbled glyphs, and for
// Uzbek names they add Arabic calligraphy unprompted. Keep this short: a long negation list
// ("no text, no letters, no words, no numbers, …") makes the model return an empty response
// with no image part at all.
const NO_TEXT_RULE = ", without any writing or lettering";

// The opening frame does carry the name. Spelling it out letter by letter is what makes the
// model get it right — asked plainly for "MALIKA" it returns "MAUKA", but with the dashed
// spelling and an explicit letter count it renders the word correctly.
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

// Four image calls run in parallel at ~7s each; this leaves headroom over the default limit.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { prompts, topic } = req.body || {};
    const validPrompts = (prompts && prompts.length > 0) ? prompts.filter((p) => p?.trim().length > 0).slice(0, 4) : ["Ism"];

    // Opening frame is the name itself; the rest stay as clean atmospheric backgrounds so the
    // model only has to spell the name once per video.
    const heroIndex = topic && String(topic).trim() ? 0 : -1;

    let ai = null;
    try {
      ai = getVertexAI();
    } catch (err) {
      console.warn("Vertex AI unavailable, using wallpaper fallback:", err.message);
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const generateOne = async (p, index) => {
      const enhanced = index === heroIndex
        ? nameHeroPrompt(topic)
        : p + STYLE_SUFFIXES[index % STYLE_SUFFIXES.length];
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

    const isQuotaError = (err) => /429|RESOURCE_EXHAUSTED/i.test(err?.message || "");

    // Deliberately does NOT wait out a quota rejection. Measured against the live project: once
    // the per-minute image quota trips it stays shut for ~55s regardless of how far it was
    // exceeded, and waiting 38s inside the request still came back throttled while pushing the
    // handler to 48s. So a quota hit falls back immediately rather than stalling the video for
    // a result that isn't coming. Raising the quota in Cloud Console is the actual fix.
    // The short retry is for transient, non-quota blips only.
    const RETRY_BACKOFF_MS = [1500];

    const images = await Promise.all(validPrompts.map(async (p, index) => {
      if (ai) {
        // Stagger launches — the model rejects bursts of simultaneous requests
        // (RESOURCE_EXHAUSTED) even when a single request succeeds instantly.
        await sleep(index * 150);

        for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
          try {
            return await generateOne(p, index);
          } catch (err) {
            const last = attempt === RETRY_BACKOFF_MS.length;
            if (last || isQuotaError(err)) {
              console.warn(`Gemini image generation failed for prompt ${index}, using wallpaper fallback:`, err.message);
              break;
            }
            console.warn(`Gemini image generation failed for prompt ${index}, retrying:`, err.message);
            await sleep(RETRY_BACKOFF_MS[attempt]);
          }
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
