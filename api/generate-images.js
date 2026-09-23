import { getVertexAI, executeWithQuotaFallback, fetchPollinationsImage, getCachedImage, setCachedImage, setCors } from "./_helpers.js";
import { NAME_ART_CONCEPTS, toneFor } from "../nameArtConcepts.js";

// Same-origin fallback (used only if both Vertex AI and Pollinations AI fail) —
// Cinematic 9:16 vertical aesthetic scene wallpapers
const HD_WALLPAPERS = [
  "/fallback/scene-1.jpg",
  "/fallback/scene-2.jpg",
  "/fallback/scene-3.jpg",
  "/fallback/scene-4.jpg",
];

// Fallback thematic archetypes if no name is provided:
const SCENE_ENHANCERS = [
  (p) => `Majestic royal architectural vista, grand sunrise with golden morning rays breaking through misty clouds, opulent palace archways, soaring eagle, timeless strength. ${p}`,
  (p) => `Mysterious celestial twilight, tranquil reflective water, glowing starlight particles and deep indigo ethereal atmosphere capturing inner wisdom. ${p}`,
  (p) => `Warm golden hour glow, delicate warm embers floating in serene breeze, lush botanical realism, radiant sunlight, pure emotional beauty. ${p}`,
  (p) => `Grand triumphant horizon at dawn, infinite golden sky, radiant dawn rays, ultimate nobility, victory and boundless freedom. ${p}`
];

// Intelligent Uzbek/Central Asian gender detection for personalized visuals
const detectGender = (name) => {
  const lower = String(name || "").trim().toLowerCase();
  // Female suffixes and common endings
  if (/(oy|gul|noza|bonu|xon|begim|bika|niso|ora|poshsha|iya|zoda|zuhra|moh|dil|chechak|oyim|eva|ova|yulduz|mohira|malika|laylo|sevara|dildora)$/i.test(lower)) {
    return "FEMALE";
  }
  // Male suffixes and common endings
  if (/(bek|jon|dor|murod|shoh|mirzo|ali|boy|qul|iddin|ulloh|yor|zod|er|voy|ov|ev|polvon|botir|sarvar|sardor|sher|ar|al|ur|ir|temur|amir|islom|bobur|jasur|javohir)$/i.test(lower)) {
    return "MALE";
  }
  return "UNISEX";
};

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { prompts, topic, gender } = req.body || {};
    const validPrompts = (prompts && prompts.length > 0) ? prompts.filter((p) => p?.trim().length > 0).slice(0, 4) : ["Ism"];
    const hasTopic = topic && String(topic).trim().length > 0;
    const effectiveGender = (gender && gender !== 'UNISEX') ? gender : detectGender(topic);
    const genderTone = toneFor(effectiveGender);

    // Pick 4 distinct styles from NAME_ART_CONCEPTS for maximum variety
    // (e.g. Royal Gold, Cosmic Nebula, Crystal Diamond, Glacial Ice, Emerald Botanical)
    const shuffledConcepts = [...NAME_ART_CONCEPTS].sort(() => 0.5 - Math.random());
    const frameConcepts = [0, 1, 2, 3].map(i => shuffledConcepts[i % shuffledConcepts.length]);

    let aiAvailable = true;
    try {
      getVertexAI();
    } catch (err) {
      console.warn("Vertex AI unavailable, will rely on Pollinations AI fallback:", err.message);
      aiAvailable = false;
    }

    const buildFramePrompt = (promptText, topicName, frameIndex) => {
      if (hasTopic) {
        const clean = String(topicName).trim().toUpperCase().slice(0, 20);
        const concept = frameConcepts[frameIndex % frameConcepts.length];
        const sceneContext = promptText && String(promptText).trim().length > 10
          ? `Thematic scene atmosphere inspired by the name's meaning: ${String(promptText).replace(/["']/g, "").trim()}.`
          : "";

        return `Vertical 9:16 smartphone wallpaper key visual. Breathtaking personalized 3D typography artwork spelling the exact word "${clean}".
${concept.art}.
${sceneContext}

CRITICAL TYPOGRAPHY & SPELLING:
- The entire word "${clean}" MUST be rendered on a SINGLE HORIZONTAL LINE from left to right.
- Exact spelling: "${clean}" (${clean.length} Latin letters). All ${clean.length} letters must be sculpted side-by-side on ONE continuous horizontal baseline in magnificent 3D ${concept.typography}, expressing ${genderTone}.
- Positioned centered in the upper-middle area (between 35% and 55% vertical height) with elegant margins.
- Keep the bottom 30% of the canvas clean with soft atmospheric background and ambient light so video subtitles can be displayed with 100% clarity.
- Masterpiece, 8k resolution, dramatic studio lighting, sharp depth of field, raytraced reflections, ultra-high definition luxury aesthetic. The ONLY text visible in the entire image is "${clean}".`;
      }

      // If no name topic provided, generate pure cinematic landscape
      const isDetailed = promptText && String(promptText).trim().length > 15;
      const coreScene = isDetailed
        ? String(promptText).replace(/["']/g, "").trim()
        : SCENE_ENHANCERS[frameIndex % SCENE_ENHANCERS.length](promptText || "Cinematic landscape");

      return `Vertical 9:16 smartphone wallpaper key visual. ${coreScene}. Masterpiece, 8k resolution, cinematic lighting, photorealistic, Unreal Engine 5 render, volumetric atmosphere, shallow depth of field, clean background artwork, no text, no watermark.`;
    };

    const generateOne = async (p, index) => {
      const enhanced = buildFramePrompt(p, topic, index);

      // Check cache first to avoid redundant API calls
      const cacheKey = `frame_art:${topic || 'gen'}:${effectiveGender}:${index}:${enhanced.slice(0, 80)}`;
      const cached = getCachedImage(cacheKey);
      if (cached) {
        console.log(`Using cached image for frame index ${index}`);
        return cached;
      }

      // Alternate primary model between frames to distribute Vertex AI quota, with 2.5-flash-image as resilient 3rd fallback
      const modelOrder = index % 2 === 0
        ? ["gemini-3.1-flash-lite-image", "gemini-3.1-flash-image", "gemini-2.5-flash-image"]
        : ["gemini-3.1-flash-image", "gemini-3.1-flash-lite-image", "gemini-2.5-flash-image"];

      const response = await executeWithQuotaFallback(
        async (ai, loc, modelToUse) => {
          return await ai.models.generateContent({
            model: modelToUse,
            contents: [{ role: "user", parts: [{ text: enhanced }] }],
            config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "9:16" } },
          });
        },
        modelOrder
      );

      const part = response.candidates?.[0]?.content?.parts?.find((partItem) => partItem.inlineData);
      if (!part?.inlineData?.data) throw new Error("Rasm ma'lumoti topilmadi");
      
      const imgData = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      setCachedImage(cacheKey, imgData);
      return imgData;
    };

    const processFrame = async (p, index) => {
      let generated = null;
      if (aiAvailable) {
        try {
          generated = await generateOne(p, index);
        } catch (err) {
          console.warn(`Frame ${index} Vertex AI generation failed, using Pollinations AI:`, err.message);
        }
      }

      // If Vertex AI did not produce an image, use Pollinations AI Turbo before static wallpapers
      if (!generated) {
        const enhanced = buildFramePrompt(p, topic, index);

        try {
          const pollinationsImg = await fetchPollinationsImage(enhanced, 768, 1344);
          if (pollinationsImg) {
            generated = pollinationsImg;
            const cacheKey = `frame_art:${topic || 'gen'}:${effectiveGender}:${index}:${enhanced.slice(0, 80)}`;
            setCachedImage(cacheKey, pollinationsImg);
          }
        } catch (pollErr) {
          console.warn(`Pollinations AI failed for frame ${index}:`, pollErr.message);
        }
      }

      return generated || HD_WALLPAPERS[index % HD_WALLPAPERS.length];
    };

    // ⚡ Single-frame mode: ultra-fast (~6-8s), lightweight payload (<2MB), 100% within Vercel limits!
    if (typeof req.body?.frameIndex === "number" || (req.body?.prompt && !req.body?.prompts)) {
      const idx = typeof req.body?.frameIndex === "number" ? req.body.frameIndex : 0;
      const text = req.body?.prompt || (prompts && prompts[0]) || topic || "Ism";
      const image = await processFrame(text, idx);
      return res.status(200).json({ image, index: idx });
    }

    // Generate frames sequentially to preserve Vertex AI RPM quota and prevent 429 burst errors
    const images = [];
    for (let idx = 0; idx < validPrompts.length; idx++) {
      const p = validPrompts[idx];
      const img = await processFrame(p, idx);
      images.push(img);
    }

    return res.status(200).json({ images });
  } catch (err) {
    console.error("generate-images error:", err);
    res.status(500).json({ error: err.message || "Rasm xatoligi" });
  }
}
