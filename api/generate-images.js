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

const CAMERA_PERSPECTIVES = [
  "Monumental front-facing eye-level view with aristocratic symmetry and grand vertical presence",
  "Dramatic cinematic low-angle hero perspective looking upwards, emphasizing majestic monolithic scale",
  "Cinematic 3/4 angled perspective with rich architectural depth of field and soft focal blur",
  "Gentle floating weightless perspective with subtle cinematic tilt and generous breathing room",
  "Dynamic wide-angle cinematic framing with breathtaking spatial depth and sharp environmental clarity"
];

const LIGHTING_ATMOSPHERES = [
  "Opulent warm golden volumetric studio god-rays cutting through subtle atmospheric haze, sharp raytraced reflections",
  "Moody nocturnal luxury ambiance with vivid bioluminescent rim-lights and deep obsidian contrast",
  "Ethereal dawn horizon sunrise with warm chromatic lens flares and gleaming crystal refractions",
  "High-end editorial gallery rim-lighting with soft diffused fill and delicate floating ambient dust particles",
  "Dramatic twilight cinematic atmosphere with luminous starlight reflections and glowing prismatic highlights",
  "Warm golden-hour side lighting with rich deep shadows, soft amber rim highlights, and crystalline reflections"
];

const CINEMATIC_AESTHETICS = [
  "Masterpiece, 8k resolution, IMAX 70mm cinematography, Unreal Engine 5 render, volumetric atmosphere, photorealistic",
  "Cinematic masterpiece, 8k, award-winning National Geographic cinematography, anamorphic lens flare, shallow depth of field",
  "Epic cinematic visual, 8k resolution, Hasselblad medium format photography, breathtaking natural lighting, raytraced ambiance",
  "Masterpiece fine-art cinema visual, 8k, Panavision anamorphic lens, atmospheric misty morning light, hyper-detailed textures",
  "Breathtaking high-end film still, 8k, ARRI Alexa LF camera, gorgeous natural color grading, volumetric light rays"
];

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const {
      prompt,
      prompts,
      topic,
      gender,
      frameIndex,
      totalFrames,
      isNameArt,
      conceptIndex,
      conceptA,
      conceptB
    } = req.body || {};

    const validPrompts = (prompts && prompts.length > 0) ? prompts.filter((p) => p?.trim().length > 0).slice(0, 4) : ["Ism"];
    const hasTopic = topic && String(topic).trim().length > 0;
    const effectiveGender = (gender && gender !== 'UNISEX') ? gender : detectGender(topic);
    const genderTone = toneFor(effectiveGender);
    const totalCount = typeof totalFrames === "number" ? totalFrames : (validPrompts ? validPrompts.length : 4);

    let aiAvailable = true;
    try {
      getVertexAI();
    } catch (err) {
      console.warn("Vertex AI unavailable, will rely on Pollinations AI fallback:", err.message);
      aiAvailable = false;
    }

    const determineIsNameArt = (idx) => {
      if (typeof isNameArt === "boolean") return isNameArt;
      if (!hasTopic) return false;
      // Exactly 2 frames: Frame 0 (intro hook) and the final frame (outro/climax)
      return idx === 0 || idx === Math.max(1, totalCount - 1);
    };

    const getConceptForFrame = (idx) => {
      if (typeof conceptIndex === "number" && NAME_ART_CONCEPTS[conceptIndex]) {
        return NAME_ART_CONCEPTS[conceptIndex];
      }
      if (idx === 0 && typeof conceptA === "number" && NAME_ART_CONCEPTS[conceptA]) {
        return NAME_ART_CONCEPTS[conceptA];
      }
      if (idx > 0 && typeof conceptB === "number" && NAME_ART_CONCEPTS[conceptB]) {
        return NAME_ART_CONCEPTS[conceptB];
      }
      const randIdx = (Math.floor(Math.random() * NAME_ART_CONCEPTS.length) + (idx * 7)) % NAME_ART_CONCEPTS.length;
      return NAME_ART_CONCEPTS[randIdx];
    };

    const buildFramePrompt = (promptText, topicName, idx) => {
      const isTypographyFrame = determineIsNameArt(idx);
      const isDetailed = promptText && String(promptText).trim().length > 15;
      const coreScene = isDetailed
        ? String(promptText).replace(/["']/g, "").trim()
        : SCENE_ENHANCERS[idx % SCENE_ENHANCERS.length](promptText || "Cinematic landscape");

      if (hasTopic && isTypographyFrame) {
        const clean = String(topicName).trim().toUpperCase().slice(0, 20);
        const concept = getConceptForFrame(idx);
        const angle = CAMERA_PERSPECTIVES[Math.floor(Math.random() * CAMERA_PERSPECTIVES.length)];
        const lighting = LIGHTING_ATMOSPHERES[Math.floor(Math.random() * LIGHTING_ATMOSPHERES.length)];
        const sceneContext = promptText && String(promptText).trim().length > 10
          ? `Thematic environmental aura reflecting the name's spirit: ${String(promptText).replace(/["']/g, "").trim()}.`
          : "";

        return `Vertical 9:16 smartphone wallpaper key visual. Breathtaking personalized 3D typography artwork spelling the exact word "${clean}".
${concept.art}.
${sceneContext}
Camera perspective: ${angle}.
Lighting atmosphere: ${lighting}.

CRITICAL TYPOGRAPHY & SPELLING:
- The entire word "${clean}" MUST be rendered on a SINGLE HORIZONTAL LINE from left to right.
- Exact spelling: "${clean}" (${clean.length} Latin letters). All ${clean.length} letters must be sculpted side-by-side on ONE continuous horizontal baseline in magnificent 3D ${concept.typography}, expressing ${genderTone}.
- Positioned centered in the upper-middle area (between 35% and 55% vertical height) with elegant margins.
- Keep the bottom 30% of the canvas clean with soft atmospheric background and ambient light so video subtitles can be displayed with 100% clarity.
- Masterpiece, 8k resolution, ultra-high definition luxury aesthetic. The ONLY text visible in the entire image is "${clean}".`;
      }

      // Non-typography frames (Frame 1, 2, etc.): Pure cinematic storytelling scene with STRICT NO TEXT
      const cinemaStyle = CINEMATIC_AESTHETICS[Math.floor(Math.random() * CINEMATIC_AESTHETICS.length)];
      return `Vertical 9:16 smartphone wallpaper key visual. ${coreScene}. ${cinemaStyle}. Clean background artwork, atmospheric depth.
STRICT NEGATIVE CONSTRAINT: NO text, NO letters, NO words, NO typography, NO watermark, NO alphabet symbols. Pure photographic cinematic world.`;
    };

    const generateOne = async (p, index) => {
      const enhanced = buildFramePrompt(p, topic, index);

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

      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
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
        const isTypographyFrame = determineIsNameArt(index);
        let pollinationsPrompt = "";
        if (hasTopic && isTypographyFrame) {
          const clean = String(topic).trim().toUpperCase().slice(0, 20);
          const concept = getConceptForFrame(index);
          pollinationsPrompt = `Breathtaking 3D typography spelling "${clean}", sculpted in ${concept.typography}, ${concept.art.slice(0, 150)}, 9:16 smartphone wallpaper, 8k, raytracing`;
        } else {
          const isDetailed = p && String(p).trim().length > 15;
          const coreScene = isDetailed
            ? String(p).replace(/["']/g, "").trim()
            : SCENE_ENHANCERS[index % SCENE_ENHANCERS.length](p || "Cinematic landscape");
          pollinationsPrompt = `${coreScene}, cinematic 9:16 vertical scenery, photorealistic, 8k, no text, no words`;
        }

        try {
          const pollinationsImg = await fetchPollinationsImage(pollinationsPrompt, 768, 1344);
          if (pollinationsImg) {
            generated = pollinationsImg;
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
