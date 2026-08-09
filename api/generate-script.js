import { getVertexAI, parseJSON, setCors } from "./_helpers.js";

const SCRIPT_SYSTEM_INSTRUCTION = `
Siz ijtimoiy tarmoqlar (Instagram Reels/TikTok) uchun millionlab ko'rishlar (views) yig'adigan, o'ta VIRAL ismlar tahlili videolarini yaratuvchi daho marketolog va psixologsiz.
Sizning vazifangiz: Berilgan ISM bo'yicha odamlarni "shok"ka tushiradigan, o'zini tanishga majbur qiladigan va do'stlariga yuborishga (share qilishga) undaydigan 60 soniyalik portlovchi ssenariy yozish.

JSON Output Format:
{
  "script_segments": ["Hook qismi...", "Yashirin haqiqat...", "Sevgi va munosabatlar...", "Kelib chiqishi va kuchi...", "Yakuniy chaqiruv (CTA)..."],
  "full_script": "To'liq matn...",
  "hashtags": ["#ismlar", "#ismmaonosi"],
  "image_prompts_en": ["Prompt 1...", "Prompt 2...", "Prompt 3...", "Prompt 4..."]
}
`;

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { topic, useSearch, hookStyle } = req.body || {};
    if (!topic) return res.status(400).json({ error: "topic maydoni kerak" });

    const ai = getVertexAI();

    const hookInstructions = hookStyle
      ? `\n- VIRAL HOOK STYLE: ${hookStyle} uslubida boshlang.`
      : "\n- VIRAL HOOK STYLE: Tasodifiy eng jozibali hook turini tanlang.";

    const config = {
      systemInstruction: SCRIPT_SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
    };

    const models = ["gemini-2.5-flash"];
    let lastError = null;

    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: `Ism: "${topic}". Ushby ismning tub ma'nosi, tarixi va psixologik portretini to'liq ochib beruvchi 60 soniyalik viral ssenariy yozing.${hookInstructions}`,
          config,
        });

        if (!response.text) continue;
        const parsed = parseJSON(response.text);

        const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
          ?.map((c) => (c.web ? { title: c.web.title, uri: c.web.uri } : null))
          .filter(Boolean) || [];

        if (!parsed.full_script) parsed.full_script = parsed.script_segments?.join(" ") || `${topic} ismining ma'nosi juda ajoyib.`;
        if (!parsed.image_prompts_en?.length) parsed.image_prompts_en = [`Cinematic beautiful typography of name ${topic}`];
        if (parsed.image_prompts_en.length > 4) parsed.image_prompts_en = parsed.image_prompts_en.slice(0, 4);

        return res.status(200).json({ ...parsed, sources });
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  } catch (err) {
    console.error("generate-script error:", err);
    res.status(500).json({ error: err.message || "Server xatoligi" });
  }
}
