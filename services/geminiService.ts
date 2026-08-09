import { GoogleGenAI } from "@google/genai";
import { SCRIPT_SYSTEM_INSTRUCTION } from "../constants";
import { VoiceType, HookStyle } from "../types";

const API_BASE = "/api";

export const generateScript = async (topic: string, useSearch: boolean, hookStyle: HookStyle = HookStyle.RANDOM) => {
  // 1. Try Vertex AI Serverless Backend (/api/generate-script) with GCP $273+ credits
  try {
    const res = await fetch(`${API_BASE}/generate-script`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, useSearch, hookStyle }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (backendErr) {
    console.warn("Backend /api/generate-script unavailable, falling back to direct API key:", backendErr);
  }

  // 2. Fallback to Direct Client SDK if backend API endpoint is unroutable
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
  if (!apiKey) throw new Error("API Kalit yoki Server ulanishi sozlanmagan");
  const ai = new GoogleGenAI({ apiKey });

  const hookInstructions = hookStyle
    ? `\n- VIRAL HOOK STYLE: ${hookStyle} uslubida boshlang.`
    : "\n- VIRAL HOOK STYLE: Tasodifiy eng jozibali hook turini tanlang.";

  const config: any = {
    systemInstruction: SCRIPT_SYSTEM_INSTRUCTION,
    responseMimeType: "application/json",
  };

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Ism: "${topic}". Ushby ismning tub ma'nosi, tarixi va psixologik portretini to'liq ochib beruvchi 60 soniyalik viral ssenariy yozing.${hookInstructions}`,
    config,
  });

  if (!response.text) throw new Error("Ssenariy yaratib bo'lmadi");

  let clean = response.text.trim().replace(/```json/g, "").replace(/```/g, "").trim();
  let parsed: any;
  try {
    parsed = JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*?\}|\[[\s\S]*?\]/);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error("JSON formatini o'qib bo'lmadi");
  }

  const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
    ?.map((c: any) => (c.web ? { title: c.web.title, uri: c.web.uri } : null))
    .filter(Boolean) || [];

  if (!parsed.full_script) parsed.full_script = parsed.script_segments?.join(" ") || `${topic} ismining ma'nosi juda ajoyib.`;
  if (!parsed.image_prompts_en?.length) parsed.image_prompts_en = [`Cinematic beautiful typography of name ${topic}`];
  if (parsed.image_prompts_en.length > 4) parsed.image_prompts_en = parsed.image_prompts_en.slice(0, 4);

  return { ...parsed, sources };
};

export const generateAudio = async (text: string, voiceType: VoiceType): Promise<string> => {
  // Return empty string fallback if TTS API is unavailable directly on client
  return "";
};

export const generateImages = async (prompts: string[]): Promise<string[]> => {
  return [
    "https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?auto=format&fit=crop&w=1080&h=1920&q=80",
    "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1080&h=1920&q=80",
    "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=1080&h=1920&q=80",
    "https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=1080&h=1920&q=80",
  ];
};

export const findImages = async (topic: string): Promise<string[]> => {
  return [
    "https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?auto=format&fit=crop&w=1080&h=1920&q=80",
    "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1080&h=1920&q=80",
    "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=1080&h=1920&q=80",
    "https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=1080&h=1920&q=80",
  ];
};

export const generateTopicIdeas = async (category: string): Promise<string[]> => {
  return ["Muhammad", "Ali", "Madina", "Rayhona", "Umar", "Imron", "Safiya", "Yasmina"];
};

