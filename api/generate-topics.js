import { getVertexAI, parseJSON, retry, setCors } from "./_helpers.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { category } = req.body || {};
    const ai = getVertexAI(); // location: "global"
    const safeCategory = category || "Popular Names";

    const response = await retry(() => ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: `Generate 8 unique, meaningful, and popular Uzbek names for the category: "${safeCategory}". Do not include surnames. Return ONLY a JSON array of strings. Example: ["Name1", "Name2"]`,
      config: { responseMimeType: "application/json" },
    }));

    const names = parseJSON(response.text || "[]");
    if (names && names.length > 0) {
      return res.status(200).json({ names });
    }
    throw new Error("Ismlar topilmadi");
  } catch (err) {
    console.error("generate-topics error:", err);
    res.status(200).json({
      names: ["Muhammad", "Ali", "Madina", "Rayhona", "Umar", "Imron", "Safiya", "Yasmina"],
    });
  }
}
