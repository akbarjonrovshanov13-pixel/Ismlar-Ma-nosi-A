import { getVertexAI, parseJSON, retry, setCors } from "./_helpers.js";

const SCRIPT_SYSTEM_INSTRUCTION = `
Siz ismlarning qadimiy kelib chiqishi, etimologiyasi, yashirin energetikasi va chuqur psixologik portretini ochib beruvchi buyuk psixolog va mahoratli adibsiz.
Sizning vazifangiz: Berilgan ISM bo'yicha insonning qalb tubidagi haqiqatlarini, fe'l-atvorining yashirin ziddiyatlarini va tug'ma qudratini ochib beruvchi, chuqur ma'noli va portlovchi 60 soniyalik ssenariy yozish.

CHUQUR VA TERAN TAHLIL TALABLARI:
- Yuzaki, umumiy maqtovlar yoki quruq shablonlardan qat'iy qoching!
- Ism egasining ichki ruhiyatini teran oching: u tashqi dunyoga qanday ko'rinadi (qat'iyatli, vazmin, sirli yoki mag'rur) va yolg'iz qolganda uning qalbida nimalar kechadi (nozik sezgirlik, sadoqat, his-tuyg'ularini oshkor qilmaslik).
- Ularning boshqalarda kam uchraydigan o'ziga xos xarakteri, o'tkir aqli, liderlik kuchi yoki hayotiy sinovlarda yengilmas irodasini psixologik aniqlik bilan yoritib bering.
- Har bir jumla chuqur falsafiy ma'no, jarangdor so'z boyligi va ta'sirchan ritmga ega bo'lsin.

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

IMAGE_PROMPTS_EN UCHUN QAT'IY TALABLAR (Videodagi 4 ta asosiy bosqich uchun 4 ta kinematografik sahna):
Har bir prompt aynan shu ISMNING ASL TUB MA'NOSI va ETIMOLOGIYASIGA 100% MOS KELADIGAN, xilma-xil va betakror sahna bo'lishi shart!
QAT'IY TALAB: Hamma ismga bir xil "tog' cho'qqisi" yoki "tog'lar" deb yozish QAT'IYAN TAQIQLANADI! Ism nimani anglatsa, aynan o'sha mavzudagi ramziy sahna bo'lsin:

- Agar ism gullar, tabiat yoki bahor bilan bog'liq bo'lsa (Rayhon, Gulnoza, Lola, Bahora, Sevara...) -> Gullagan sokin bog'lar, tonggi shudring, mayin shafaq, sakura va gul barglari, nafis zumrad tabiat.
- Agar ism qimmatbaho toshlar, javohirlar bilan bog'liq bo'lsa (Javohir, Gavhar, Feruza, Zumrad, Durdona...) -> Qimmatbaho olmos qirralari, feruza va zumrad jilolari, billur prizma nurlari, zargarlik nafosati.
- Agar ism samoviy, yorug'lik, nur bilan bog'liq bo'lsa (Yulduz, Shams, Nuriddin, Oybek, Ziyoda...) -> Cheksiz yulduzli galaktika, to'lin oy yog'dusi, quyosh nurlari, oltin nur zarrachalari.
- Agar ism shohona, hukmdorlik, yetakchilik bilan bog'liq bo'lsa (Shahzod, Sulton, Amir, Malik, Bekzod...) -> Muhtasham qasr zallari, marmar saroylar, oltin koshinlar, qirollik hashamati.
- Agar ism daryo, dengiz, suv bilan bog'liq bo'lsa (Dengiz, Ummon, Nilufar, Daryo...) -> Moviy toza ummon, sokin suv yuzidagi nurlar, shaffof sharshara.
- Agar ism ilm, donolik, tafakkur bilan bog'liq bo'lsa (Doniyor, Hakim, Olim, Zakiya...) -> Qadimiy muhtasham kutubxona, sham yorug'i, qadimiy xaritalar, donolik maskani.
- Agar ism qudrat, mardlik bilan bog'liq bo'lsa (Sherzod, Rustam, Temur, Polvon...) -> Mahobatli qadimiy qal'a, qudratli ramziy haykaltaroshlik, olov va po'lat qudrati.

4 BOSQICH TUZILISHI:
1-prompt: Ismning tub ma'nosi va asl ramzi (yuqoridagi mavzusiga mos betakror kompozitsiya, no text).
2-prompt: Ichki ruhiyat va xarakter (sirli, sokin va chuqur muhit, no text).
3-prompt: Tuyg'ular, qalb jilosi va mehr (iliq yorug'lik, zarrachalar, nafislik, no text).
4-prompt: Yuksak orzular, muvaffaqiyat va yorqin istiqbol (keng ufq, erkin osmon, zafarli porloq muhit, no text).

QAT'IY QOIDALAR:
1. BARCHA 4 ta kadrda hech qanday yozuv, harf yoki so'z bo'lmasin (NO text, NO letters, NO words), toki videodagi animatsiyali ism va subtitrlar tiniq, chiroyli ko'rinsin.
2. Diniy ramzlar va sig'inish belgilaridan foydalanmang.
3. Odam yuzini yaqindan ko'rsatmang (faqat siluet, orqa tomondan yoki ramziy manzara).
4. Har bir prompt ingliz tilida, o'ta ta'sirli va sifatli bo'lsin (taxminan 15-25 so'z).
`;

export const maxDuration = 60;
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { topic, useSearch, hookStyle } = req.body || {};
    if (!topic) return res.status(400).json({ error: "topic maydoni kerak" });

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

    const models = [
      { name: "gemini-3.8-flash", loc: "global" },
      { name: "gemini-3.1-pro-preview", loc: "global" },
      { name: "gemini-3.1-flash-lite", loc: "global" },
      { name: "gemini-2.5-flash", loc: "us-central1" },
    ];
    let lastError = null;

    for (const m of models) {
      try {
        const ai = getVertexAI(m.loc);
        const response = await retry(() =>
          ai.models.generateContent({
            model: m.name,
            contents: `Ism: "${topic}". Ushbu ismning tub ma'nosi, tarixi va psixologik portretini to'liq ochib beruvchi 60 soniyalik viral ssenariy yozing.${hookInstructions}`,
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
