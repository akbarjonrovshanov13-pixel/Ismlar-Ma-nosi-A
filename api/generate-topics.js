import { getVertexAI, parseJSON, setCors } from "./_helpers.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { category } = req.body || {};
    const ai = getVertexAI();
    const safeCategory = category || "Popular Names";

    const models = ["gemini-2.5-flash"];
    let lastError = null;

    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model: model,
          contents: `Generate 8 unique, meaningful, and popular Uzbek names for the category: "${safeCategory}". Do not include surnames. Return ONLY a JSON array of strings. Example: ["Name1", "Name2"]`,
          config: { responseMimeType: "application/json" },
        });

        const names = parseJSON(response.text || "[]");
        if (names && names.length > 0) {
          return res.status(200).json({ names });
        }
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  } catch (err) {
    console.error("generate-topics error:", err);
    res.status(200).json({
      names: ["Muhammad", "Ali", "Madina", "Rayhona", "Umar", "Imron", "Safiya", "Yasmina"],
    });
  }
}
