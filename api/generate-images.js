import { setCors } from "./_helpers.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { prompts } = req.body || {};
    const validPrompts = (prompts && prompts.length > 0)
      ? prompts.filter((p) => p?.trim().length > 0).slice(0, 4)
      : ["Cinematic beautiful typography poster of name"];

    const results = validPrompts.map((p, index) => {
      const cleanPrompt = encodeURIComponent(`${p}, 8k resolution, cinematic volumetric lighting, 9:16 vertical aspect ratio, masterpiece, highly detailed photorealistic`);
      const seed = Math.floor(Math.random() * 10000) + index * 777;
      return `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1080&height=1920&nologo=true&seed=${seed}`;
    });

    return res.status(200).json({ images: results });
  } catch (err) {
    console.error("generate-images error:", err);
    res.status(500).json({ error: err.message || "Rasm xatoligi" });
  }
}
