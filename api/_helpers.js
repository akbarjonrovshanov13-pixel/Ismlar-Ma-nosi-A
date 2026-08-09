import { GoogleGenAI, Modality } from "@google/genai";

// Vertex AI client — $273 GCP kredit orqali ishlaydi
// Service Account: vertex-sa@gen-lang-client-0604912271 (cross-project access)
// Billing Project: project-f811a9b5-056c-4f67-b95 ($273.02 kredit)
export function getVertexAI() {
  // 1. Agar GEMINI_API_KEY (AI Studio Billing Key) berilgan bo'lsa, to'g'ridan-to'g'ri API key bilan ishlatamiz
  if (process.env.GEMINI_API_KEY) {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  // 2. Aks holda Google Cloud Vertex AI (GCP $273.02 Billing Kredit) bilan ishlaydi
  const privateKey = process.env.GCP_PRIVATE_KEY?.replace(/\r/g, "")?.replace(/\\n/g, "\n");
  const clientEmail = process.env.GCP_CLIENT_EMAIL;
  const projectId = process.env.GCP_PROJECT_ID || "gen-lang-client-0604912271";

  if (!privateKey || !clientEmail) {
    throw new Error("GEMINI_API_KEY yoki (GCP_PRIVATE_KEY va GCP_CLIENT_EMAIL) sozlanmagan");
  }

  return new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location: "us-central1",
    googleAuthOptions: {
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    },
  });
}

// JSON parse helper
export function parseJSON(text) {
  let clean = text.trim().replace(/```json/g, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*?\}|\[[\s\S]*?\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    throw new Error("JSON formatini o'qib bo'lmadi");
  }
}

// CORS headers
export function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
