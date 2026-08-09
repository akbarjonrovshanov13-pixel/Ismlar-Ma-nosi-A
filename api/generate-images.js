import { setCors } from "./_helpers.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { prompts } = req.body || {};
    if (!prompts?.length) return res.status(400).json({ error: "prompts maydoni kerak" });

    const validPrompts = prompts.filter((p) => p?.trim().length > 0).slice(0, 4);

    // 4 xil estetik va bexato 8K vertikal 9:16 uslublar (barcha ortiqcha devor yozuvlarisiz)
    const styleProfiles = [
      "luxurious 3d golden typography poster, glowing gold, obsidian black marble background, ambient warm lighting, elegant luxury atmosphere, 8k resolution, 9:16 vertical aspect ratio, masterpiece, no text on walls",
      "cosmic starry sky, glowing golden neon letters, deep indigo and violet space nebula background, ethereal light flares, bokeh, highly aesthetic, 8k resolution, 9:16 vertical aspect ratio, masterpiece",
      "magical fantasy forest, glowing emerald and sapphire light beams, sun rays filtering through trees, enchanted mystical atmosphere, extremely photorealistic, 8k resolution, 9:16 vertical aspect ratio, masterpiece",
      "cinematic emotional aesthetic atmosphere, warm sunset golden hour, soft pastel tones, dreamlike lighting, highly artistic, 8k resolution, 9:16 vertical aspect ratio, masterpiece",
    ];

    const images = validPrompts.map((p, index) => {
      // Clean prompt from unwanted text artifacts
      const cleanPromptText = p.replace(/text|words|writing|sign/gi, "").trim();
      const style = styleProfiles[index % styleProfiles.length];
      const fullPrompt = encodeURIComponent(`${cleanPromptText}, ${style}`);
      const seed = Math.floor(Math.random() * 100000) + index * 999;
      return `https://image.pollinations.ai/prompt/${fullPrompt}?width=1080&height=1920&nologo=true&seed=${seed}`;
    });

    return res.status(200).json({ images });
  } catch (err) {
    console.error("generate-images error:", err);
    res.status(500).json({ error: err.message || "Rasm xatoligi" });
  }
}
