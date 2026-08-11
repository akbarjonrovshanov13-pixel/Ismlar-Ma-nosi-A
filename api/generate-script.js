import { getVertexAI, parseJSON, retry, setCors } from "./_helpers.js";

const SCRIPT_SYSTEM_INSTRUCTION = `
Siz ijtimoiy tarmoqlar (Instagram Reels/TikTok) uchun millionlab ko'rishlar (views) yig'adigan, o'ta VIRAL ismlar tahlili videolarini yaratuvchi daho marketolog va psixologsiz.
Sizning vazifangiz: Berilgan ISM bo'yicha odamlarni "shok"ka tushiradigan, o'zini tanishga majbur qiladigan va do'stlariga yuborishga (share qilishga) undaydigan 60 soniyalik portlovchi ssenariy yozish.

JSON Output Format (bu yerdagi <...> belgilar TUSHUNTIRISH — ularni ko'chirmang, o'rniga haqiqiy
matn yozing. "script_segments" ichida ham to'liq, tayyor gaplar bo'lishi shart):
{
  "script_segments": [
    "<hook: 1-2 to'liq gap>",
    "<yashirin haqiqat: 2-3 to'liq gap>",
    "<sevgi va munosabatlar: 2-3 to'liq gap>",
    "<kelib chiqishi va kuchi: 2-3 to'liq gap>",
    "<yakuniy chaqiruv: 1-2 to'liq gap>"
  ],
  "full_script": "<yuqoridagi 5 segmentning birlashtirilgan to'liq matni>",
  "hashtags": ["#ismlar", "#ismmaonosi"],
  "image_prompts_en": ["<1-prompt>", "<2-prompt>", "<3-prompt>", "<4-prompt>"]
}

MUHIM: "script_segments" videodagi subtitr matni. full_script esa aynan shu segmentlardan
tashkil topadi — ikkalasi bir xil matn bo'lishi kerak, faqat biri bo'lingan, biri yaxlit.

IMAGE_PROMPTS_EN UCHUN QAT'IY QOIDALAR:
1. Rasmda HECH QANDAY YOZUV bo'lmasin — matn, harf, so'z, ism, kalligrafiya (arabcha, lotin yoki boshqa yozuv), plakat yozuvi, logotip yoki raqam. Ism videoda subtitr orqali ko'rsatiladi, rasmga yozish SHART EMAS. Promptda "typography", "text", "letters", "calligraphy", "name written" kabi so'zlarni umuman ishlatmang.
2. Diniy ramzlar, muqaddas yozuvlar va sig'inish belgilaridan foydalanmang.
3. Har bir prompt BITTA aniq sahnani tasvirlasin. Bitta promptga bir nechta bog'liqsiz narsani (masalan sher + tog' + saroy + odam + ramzlar) yig'maganingiz muhim — aks holda rasm chalkash va bema'ni chiqadi.
4. Faqat atmosfera tasvirlansin: manzara yoki bitta obyekt, rang palitrasi, yorug'lik, fon va kayfiyat. Odam yuzini yaqindan ko'rsatmang.
5. Prompt ingliz tilida, qisqa va aniq bo'lsin (taxminan 15-25 so'z).
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

    const models = ["gemini-2.5-flash", "gemini-2.5-pro"];
    let lastError = null;

    for (const model of models) {
      try {
        const response = await retry(() =>
          ai.models.generateContent({
            model,
            contents: `Ism: "${topic}". Ushby ismning tub ma'nosi, tarixi va psixologik portretini to'liq ochib beruvchi 60 soniyalik viral ssenariy yozing.${hookInstructions}`,
            config: {
              systemInstruction: SCRIPT_SYSTEM_INSTRUCTION,
              responseMimeType: "application/json",
            },
          })
        );

        if (!response.text) continue;
        const parsed = parseJSON(response.text);

        const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
          ?.map((c) => (c.web ? { title: c.web.title, uri: c.web.uri } : null))
          .filter(Boolean) || [];

        if (!parsed.full_script) parsed.full_script = parsed.script_segments?.join(" ") || `${topic} ismining ma'nosi juda ajoyib.`;

        // The model sometimes echoes the schema back instead of filling it in, returning
        // segments like "Hook qismi..." verbatim. The narration is generated from full_script
        // so the video still sounds right, but the subtitles are placeholder text — and since
        // they no longer match the audio, alignment collapses them into the opening seconds.
        // Rebuild them from full_script when they look like the template rather than a script.
        const looksLikePlaceholder = (segments) => {
          if (!Array.isArray(segments) || !segments.length) return true;
          return segments.some((s) => {
            const text = String(s || "").trim();
            if (text.length < 25) return true;                  // real segments are full sentences
            if (/^<.*>$/.test(text)) return true;               // schema angle brackets
            return /^(hook qismi|yashirin haqiqat|sevgi va munosabatlar|kelib chiqishi|yakuniy chaqiruv)/i.test(text);
          });
        };

        if (looksLikePlaceholder(parsed.script_segments)) {
          console.warn("generate-script: segments looked like the template, rebuilding from full_script");
          const sentences = String(parsed.full_script).match(/[^.!?]+[.!?]+/g) || [parsed.full_script];
          const perSegment = Math.max(1, Math.ceil(sentences.length / 5));
          parsed.script_segments = [];
          for (let i = 0; i < sentences.length; i += perSegment) {
            parsed.script_segments.push(sentences.slice(i, i + perSegment).join(" ").trim());
          }
        }
        if (!parsed.image_prompts_en?.length) parsed.image_prompts_en = ["Cinematic atmospheric background, soft warm light, elegant and aesthetic, no text"];
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
