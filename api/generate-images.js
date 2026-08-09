import { getVertexAI, retry, setCors } from "./_helpers.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { prompts } = req.body || {};
    if (!prompts?.length) return res.status(400).json({ error: "prompts maydoni kerak" });

    const ai = getVertexAI(); // location: "global" — gemini-3.1-flash-lite-image ishlaydi

    const validPrompts = prompts.filter((p) => p?.trim().length > 0).slice(0, 4);

    // 4 xil estetik uslub (1-avgustdagi ai-media-lab-app dagi kabi)
    const styleSuffixes = [
      ", luxurious royal gold style, glowing gold typography on obsidian black marble, ambient warm glowing lights, elegant and high-end atmosphere, cinematic lighting, 8k, vertical 9:16 aspect ratio",
      ", cosmic starry sky style, glowing neon nebula background, deep indigo and violet space tones, ethereal light flares, bokeh, highly aesthetic, 8k, vertical 9:16 aspect ratio",
      ", magical fantasy forest style, glowing emerald and sapphire light beams, sun rays filtering through trees, enchanted mystical atmosphere, extremely photorealistic, 8k, vertical 9:16 aspect ratio",
      ", cinematic emotional portrait style, warm sunset golden hour, soft light pastel tones, dreamlike atmosphere, highly artistic and elegant background, 8k, vertical 9:16 aspect ratio",
    ];

    const promises = validPrompts.map((p, index) => {
      const enhanced = p + styleSuffixes[index % styleSuffixes.length];

      return retry(() => ai.models.generateContent({
        model: "gemini-3.1-flash-lite-image",
        contents: { parts: [{ text: enhanced }] },
        config: {
          responseModalities: ["IMAGE", "TEXT"],
          imageConfig: { aspectRatio: "9:16" },
        },
      }));
    });

    const results = await Promise.all(promises);
    const images = results.map((r) => {
      const part = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      return part ? `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` : null;
    }).filter(Boolean);

    res.status(200).json({ images });
  } catch (err) {
    console.error("generate-images error:", err);
    res.status(500).json({ error: err.message || "Rasm xatoligi" });
  }
}
