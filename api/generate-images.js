import { getVertexAI, executeWithQuotaFallback, fetchPollinationsImage, getCachedImage, setCachedImage, setCors } from "./_helpers.js";

// Same-origin fallback (used only if both Vertex AI and Pollinations AI fail) —
// Cinematic 9:16 vertical aesthetic scene wallpapers
const HD_WALLPAPERS = [
  "/fallback/scene-1.jpg",
  "/fallback/scene-2.jpg",
  "/fallback/scene-3.jpg",
  "/fallback/scene-4.jpg",
];

// Fallback thematic archetypes if no descriptive prompt is provided:
const SCENE_ENHANCERS = [
  (p) => `Majestic epic vista, grand sunrise with golden morning rays breaking through misty clouds, royal palace or mountain silhouette, soaring eagle, timeless strength. ${p}`,
  (p) => `Mysterious celestial twilight, tranquil reflective water, glowing starlight particles and deep indigo ethereal atmosphere capturing inner wisdom. ${p}`,
  (p) => `Warm golden hour glow, delicate warm embers floating in serene breeze, lush botanical realism, radiant sunlight, pure emotional beauty. ${p}`,
  (p) => `Grand triumphant horizon at dawn, monumental mountain summit, soaring in infinite golden sky, ultimate nobility, victory and boundless freedom. ${p}`
];

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { prompts, topic } = req.body || {};
    const validPrompts = (prompts && prompts.length > 0) ? prompts.filter((p) => p?.trim().length > 0).slice(0, 4) : ["Ism"];
    const hasTopic = topic && String(topic).trim().length > 0;

    let aiAvailable = true;
    try {
      getVertexAI();
    } catch (err) {
      console.warn("Vertex AI unavailable, will rely on Pollinations AI fallback:", err.message);
      aiAvailable = false;
    }

    const buildFramePrompt = (promptText, topicName, frameIndex) => {
      const isDetailed = promptText && String(promptText).trim().length > 15 && String(promptText).trim().toLowerCase() !== String(topicName || "").toLowerCase();

      let coreScene = "";
      if (isDetailed) {
        coreScene = String(promptText).replace(/["']/g, "").trim();
      } else if (hasTopic) {
        const cleanTopic = String(topicName).trim();
        coreScene = SCENE_ENHANCERS[frameIndex % SCENE_ENHANCERS.length](`Symbolizing the noble spirit and meaning of "${cleanTopic}".`);
      } else {
        coreScene = SCENE_ENHANCERS[frameIndex % SCENE_ENHANCERS.length](promptText || "Cinematic landscape");
      }

      return `Vertical 9:16 smartphone wallpaper key visual. ${coreScene}. Masterpiece, 8k resolution, cinematic lighting, photorealistic, Unreal Engine 5 render, volumetric atmosphere, shallow depth of field, dramatic color grading. Safe area composition with clean atmospheric bottom 30% for video subtitles. STRICT NEGATIVE: no text, no letters, no words, no watermark, no logo, no typography, clean background artwork.`;
    };

    const generateOne = async (p, index) => {
      const enhanced = buildFramePrompt(p, topic, index);

      // Check cache first to avoid redundant API calls
      const cacheKey = `frame_scene:${topic || 'gen'}:${index}:${enhanced.slice(0, 80)}`;
      const cached = getCachedImage(cacheKey);
      if (cached) {
        console.log(`Using cached image for frame index ${index}`);
        return cached;
      }

      // Execute with multi-model quota fallback: gemini-3.1-flash-lite-image as primary
      const response = await executeWithQuotaFallback(
        async (ai, loc, modelToUse) => {
          return await ai.models.generateContent({
            model: modelToUse,
            contents: [{ role: "user", parts: [{ text: enhanced }] }],
            config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "9:16" } },
          });
        },
        ["gemini-3.1-flash-lite-image", "gemini-3.1-flash-image"]
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
            const cacheKey = `frame_scene:${topic || 'gen'}:${index}:${enhanced.slice(0, 80)}`;
            setCachedImage(cacheKey, pollinationsImg);
          }
        } catch (pollErr) {
          console.warn(`Pollinations AI failed for frame ${index}:`, pollErr.message);
        }
      }

      return generated || HD_WALLPAPERS[index % HD_WALLPAPERS.length];
    };

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
