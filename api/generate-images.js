import { getVertexAI, retry, setCors } from "./_helpers.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { prompts } = req.body || {};
    if (!prompts?.length) return res.status(400).json({ error: "prompts maydoni kerak" });

    const ai = getVertexAI();

    const validPrompts = prompts.filter((p) => p?.trim().length > 0).slice(0, 4);

    const styleSuffixes = [
      ", luxurious royal gold style, glowing gold typography on obsidian black marble, ambient warm glowing lights, elegant and high-end atmosphere, cinematic lighting, 8k, vertical 9:16 aspect ratio",
      ", cosmic starry sky style, glowing neon nebula background, deep indigo and violet space tones, ethereal light flares, bokeh, highly aesthetic, 8k, vertical 9:16 aspect ratio",
      ", magical fantasy forest style, glowing emerald and sapphire light beams, sun rays filtering through trees, enchanted mystical atmosphere, extremely photorealistic, 8k, vertical 9:16 aspect ratio",
      ", cinematic emotional portrait style, warm sunset golden hour, soft light pastel tones, dreamlike atmosphere, highly artistic and elegant background, 8k, vertical 9:16 aspect ratio",
    ];

    const promises = validPrompts.map(async (p, index) => {
      const enhanced = p + styleSuffixes[index % styleSuffixes.length];
      try {
        const response = await retry(() =>
          ai.models.generateContent({
            model: "gemini-3.1-flash-lite-image",
            contents: [{ role: "user", parts: [{ text: enhanced }] }],
            config: {
              responseModalities: ["IMAGE", "TEXT"],
              imageConfig: { aspectRatio: "9:16" },
            },
          })
        );
        const part = response.candidates?.[0]?.content?.parts?.find((partItem) => partItem.inlineData);
        if (part?.inlineData?.data) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      } catch (err) {
        console.warn(`Gemini image generation failed for prompt ${index}:`, err.message);
      }

      // High-quality AI image fallback
      const cleanPrompt = encodeURIComponent(`${p}, 8k resolution, cinematic volumetric lighting, 9:16 vertical aspect ratio, masterpiece`);
      const seed = Math.floor(Math.random() * 10000) + index * 777;
      return `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1080&height=1920&nologo=true&seed=${seed}`;
    });

    const images = await Promise.all(promises);
    res.status(200).json({ images: images.filter(Boolean) });
  } catch (err) {
    console.error("generate-images error:", err);
    res.status(500).json({ error: err.message || "Rasm xatoligi" });
  }
}
