import { getVertexAI, executeWithQuotaFallback, fetchPollinationsImage, getCachedImage, setCachedImage, setCors } from "./_helpers.js";
import { NAME_ART_CONCEPTS } from "../nameArtConcepts.js";

// Same-origin fallback (used only if both Vertex AI and Pollinations AI fail) —
// Cinematic 9:16 vertical aesthetic scene wallpapers
const HD_WALLPAPERS = [
  "/fallback/scene-1.jpg",
  "/fallback/scene-2.jpg",
  "/fallback/scene-3.jpg",
  "/fallback/scene-4.jpg",
];

// 8 distinct non-repeating typography font families for extreme visual variety:
export const TYPOGRAPHY_STYLES = [
  {
    id: "imperial-serif",
    prompt: "monumental imperial serif typography with sharp chiseled brackets, classical Roman capital proportions, and noble aristocratic serif detailing"
  },
  {
    id: "calligraphic-script",
    prompt: "flowing calligraphic ribbon script typography with graceful continuous curves, sweeping flourished ligatures, and romantic sculptural swashes"
  },
  {
    id: "faceted-geometric",
    prompt: "precision-cut geometric display typography with ultra-sharp angular facets, crystalline beveled edges, and bold architectural 3D structure"
  },
  {
    id: "didone-luxury",
    prompt: "high-fashion luxury display typography with razor-sharp delicate hairlines, commanding bold structural stems, and refined neoclassical curves"
  },
  {
    id: "monolithic-block",
    prompt: "massive monumental sans-serif typography with ultra-heavy dimensional block letterforms, chamfered beveled corners, and formidable presence"
  },
  {
    id: "fluid-avantgarde",
    prompt: "avant-garde fluid dynamic typography with continuous melting organic curves, sculpted contours, and futuristic elegance"
  },
  {
    id: "expressive-brush",
    prompt: "expressive sculptural brushstroke typography with dynamic volumetric sweep, handcrafted textured ridges, and artistic momentum"
  },
  {
    id: "minimalist-bauhaus",
    prompt: "ultra-modern minimalist display typography with pure circular geometries, clean architectural negative space, and crisp contemporary lines"
  }
];

const buildVideoFramePrompt = (name, concept, font) => {
  const clean = String(name).trim().toUpperCase().slice(0, 20);
  return `Vertical 9:16 smartphone wallpaper key visual. A breathtaking 3D luxury personalized name art sculpture spelling the exact word "${clean}".

CRITICAL TYPOGRAPHY & SPELLING:
- The entire word "${clean}" MUST be rendered on a SINGLE HORIZONTAL LINE from left to right.
- NEVER split or break the name into multiple lines. NEVER stack letters vertically (do NOT write "SAR" on one line and "DOR" below it). All ${clean.length} letters must sit side-by-side on ONE continuous horizontal baseline.
- Exact spelling: "${clean}" (${clean.length} Latin letters). Render each letter exactly once, no duplicated letters, no missing letters.
- Typography: The dimensional letterforms are custom-sculpted in ${font.prompt}.

ARTWORK & MATERIAL:
- ${concept.art}.

COMPOSITION & SAFE AREA:
- Positioned horizontally centered in the upper-middle area (between 35% and 55% vertical height), spanning 65-80% canvas width with elegant margins.
- CRITICAL: Keep the bottom 30% of the canvas clean with soft atmospheric background, subtle ambient light, and negative space so video subtitles can be displayed with 100% clarity without overlapping the name sculpture.
- Photorealistic Octane render 8k, dramatic studio lighting, sharp depth of field, raytraced reflections, ultra-high definition masterpiece. The ONLY text visible anywhere in the entire image is "${clean}".`;
};

const buildClimaxFramePrompt = (name, concept, font, sceneDescription) => {
  const clean = String(name).trim().toUpperCase().slice(0, 20);
  const scene = sceneDescription && sceneDescription.length > 15 
    ? String(sceneDescription).replace(/["']/g, "").trim() 
    : "A grand epic panoramic sunrise over golden mountain peaks and infinite horizon";

  return `Vertical 9:16 smartphone wallpaper key visual. An epic cinematic scene: ${scene}.
In the upper sky and horizon, the name "${clean}" is magnificently sculpted in radiant glowing 3D ${font.prompt} made of ${concept.art}.

CRITICAL TYPOGRAPHY & SPELLING:
- The entire word "${clean}" MUST be rendered on a SINGLE HORIZONTAL LINE from left to right.
- NEVER split or break the name into multiple lines. NEVER stack letters vertically. All ${clean.length} letters must sit side-by-side on ONE continuous horizontal baseline.
- Exact spelling: "${clean}" (${clean.length} Latin letters). Render each letter exactly once, no duplicated letters, no missing letters.
- Typography: The dimensional letterforms are custom-sculpted in ${font.prompt}.

COMPOSITION & SAFE AREA:
- Positioned horizontally centered in the upper-middle area (between 35% and 55% vertical height).
- Keep the bottom 30% of the canvas clean with soft atmospheric background and negative space so video subtitles can be displayed with 100% clarity.
- Masterpiece, 8k resolution, cinematic golden lighting, photorealistic, majestic atmospheric depth, ultra-detailed. The ONLY text visible anywhere in the entire image is "${clean}".`;
};

// Fallback scene enhancers if no name topic is provided:
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
    const hasTopic = topic && String(topic).trim().length > 0;

    // Pick 4 unique concepts and 4 unique typography styles per generation run
    const shuffledConcepts = [...NAME_ART_CONCEPTS].sort(() => 0.5 - Math.random());
    const shuffledFonts = [...TYPOGRAPHY_STYLES].sort(() => 0.5 - Math.random());

    const frameSetups = [0, 1, 2, 3].map((i) => ({
      concept: shuffledConcepts[i % shuffledConcepts.length],
      font: shuffledFonts[i % shuffledFonts.length]
    }));

    let aiAvailable = true;
    try {
      getVertexAI();
    } catch (err) {
      console.warn("Vertex AI unavailable, will rely on Pollinations AI fallback:", err.message);
      aiAvailable = false;
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const buildAtmosphericScenePrompt = (promptText, topicName, frameIndex) => {
      const isDetailed = promptText && String(promptText).trim().length > 15 && String(promptText).trim().toLowerCase() !== String(topicName || "").toLowerCase();
      
      if (isDetailed) {
        const clean = String(promptText).replace(/["']/g, "").trim();
        return `Vertical 9:16 smartphone wallpaper key visual. ${clean}. Masterpiece, cinematic lighting, 8k resolution, photorealistic, majestic composition, atmospheric depth, ultra-detailed, dramatic studio lighting, clean background, no text, no letters, no words, no watermark.`;
      }

      if (topicName && String(topicName).trim().length > 0) {
        return `Vertical 9:16 smartphone wallpaper key visual. Majestic cinematic aesthetic scene symbolizing the noble spirit of "${topicName}". Dramatic lighting, epic landscape, golden hour glow, 8k resolution, photorealistic masterpiece, no text, no letters, no words, no watermark.`;
      }

      return SCENE_ENHANCERS[frameIndex % SCENE_ENHANCERS.length](promptText);
    };

    const buildFramePrompt = (promptText, topicName, frameIndex) => {
      if (hasTopic) {
        // Frame 0 (intro hook) and Frame 3 (climax outro) prominently show the name in gorgeous 3D typography
        if (frameIndex === 0) {
          const setup = frameSetups[0];
          return buildVideoFramePrompt(topicName, setup.concept, setup.font);
        }
        if (frameIndex === 3 || (validPrompts.length === 2 && frameIndex === 1)) {
          const setup = frameSetups[3 % frameSetups.length];
          return buildClimaxFramePrompt(topicName, setup.concept, setup.font, promptText);
        }
      }

      // Middle frames (1 and 2) provide pure atmospheric cinematic contrast without text, ensuring subtitles remain 100% readable
      return buildAtmosphericScenePrompt(promptText, topicName, frameIndex);
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

      // Execute with multi-region quota fallback using ultra-fast gemini-3.1-flash-lite-image
      const response = await executeWithQuotaFallback(
        async (ai, loc, modelToUse) => {
          return await ai.models.generateContent({
            model: modelToUse,
            contents: [{ role: "user", parts: [{ text: enhanced }] }],
            config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "9:16" } },
          });
        },
        ["gemini-3.1-flash-lite-image", "gemini-3.1-flash-image", "gemini-2.5-flash-image"]
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

    // Generate all frames in parallel with gentle stagger (300ms) to prevent burst quota exhaustion
    const images = await Promise.all(
      validPrompts.map(async (p, idx) => {
        if (idx > 0) await sleep(idx * 300);
        return await processFrame(p, idx);
      })
    );

    return res.status(200).json({ images });
  } catch (err) {
    console.error("generate-images error:", err);
    res.status(500).json({ error: err.message || "Rasm xatoligi" });
  }
}
