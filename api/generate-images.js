import { setCors } from "./_helpers.js";

const HD_WALLPAPERS = [
  "https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?auto=format&fit=crop&w=1080&h=1920&q=80", // Royal Gold Obsidian
  "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1080&h=1920&q=80", // Cosmic Space Nebula
  "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=1080&h=1920&q=80", // Emerald Fantasy Forest
  "https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=1080&h=1920&q=80", // Warm Sunset Golden Hour
];

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { prompts } = req.body || {};
    const validPrompts = (prompts && prompts.length > 0) ? prompts.filter((p) => p?.trim().length > 0).slice(0, 4) : ["Ism"];

    const images = validPrompts.map((_, index) => {
      return HD_WALLPAPERS[index % HD_WALLPAPERS.length];
    });

    return res.status(200).json({ images });
  } catch (err) {
    console.error("generate-images error:", err);
    res.status(500).json({ error: err.message || "Rasm xatoligi" });
  }
}
