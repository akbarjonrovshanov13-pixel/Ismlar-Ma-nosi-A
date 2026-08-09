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

    let hookInstructions = "";
    if (hookStyle === "SHOCK") {
      hookInstructions = "\n- **VIRAL HOOK STYLE:** Qat'iy ravishda SHOK / HAYRATLANARLI fakt bilan boshlang. Masalan: 'Agar ismingiz [ISM] bo'lsa, bu videoni o'chirib yubormang. Hayotingizdagi eng katta sirni ochamiz!' yoki shunga o'xshash sirlilik va drama darajasi o'ta yuqori bo'lgan boshlanish.";
    } else if (hookStyle === "FRIEND") {
      hookInstructions = "\n- **VIRAL HOOK STYLE:** Do'stlariga / tanishlariga yuborishga undovchi boshlanish bo'lsin. Masalan: 'Tezda tanishingiz bo'lgan [ISM] ga bu videoni yuboring! U o'zi haqidagi bu sirni bilishi shart.'";
    } else if (hookStyle === "PSYCHOLOGY") {
      hookInstructions = "\n- **VIRAL HOOK STYLE:** Psixologik tasdiq yoki tadqiqotga asoslangan o'ta qiziqarli boshlanish qiling. Masalan: 'Psixologlarning ta'kidlashicha, [ISM] ismli insonlar tashqaridan juda o'tkir ko'rinsalar ham, aslida...'";
    } else if (hookStyle === "INTRIGUE") {
      hookInstructions = "\n- **VIRAL HOOK STYLE:** Ularning maxfiy jozibasi yoki boshqalarni jalb qiluvchi kuchi haqida qiziqarli savol bilan boshlang.";
    } else if (hookStyle === "WARNING") {
      hookInstructions = "\n- **VIRAL HOOK STYLE:** Ogohlantirish yoki ehtiyotkorlikka chorlovchi jiddiy boshlanish qiling. Masalan: 'Hech qachon [ISM] ismli insonni aldashga urinmang yoki uni ranjitmang!'";
    } else if (hookStyle === "QUESTION") {
      hookInstructions = "\n- **VIRAL HOOK STYLE:** Hamma bilishi kerak bo'lgan, ammo ko'pchilik bilmaydigan o'ta sirli savol yoki kashfiyot bilan boshlang.";
    } else {
      hookInstructions = "\n- **VIRAL HOOK STYLE:** Tasodifiy eng jozibali, portlovchi va noodatiy hook turlaridan birini ishlating.";
    }

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
