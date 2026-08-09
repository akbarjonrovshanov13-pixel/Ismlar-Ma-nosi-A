import { GoogleGenAI } from "@google/genai";

// Vertex AI client — ai-media-lab-app loyihasidagi kabi "global" location
// Service Account: vertex-sa@gen-lang-client-0604912271 (cross-project access)
// gemini-3.1-flash-lite, gemini-3.1-flash-tts-preview, gemini-3.1-flash-lite-image
export function getVertexAI(locationOverride) {
  const privateKey = process.env.GCP_PRIVATE_KEY?.replace(/\r/g, "")?.replace(/\\n/g, "\n");
  const clientEmail = process.env.GCP_CLIENT_EMAIL;
  const projectId = process.env.GCP_PROJECT_ID || "gen-lang-client-0604912271";
  const location = locationOverride || process.env.GCP_LOCATION || "global";

  // 1. Prioritize GCP Vertex AI Service Account
  if (privateKey && clientEmail) {
    return new GoogleGenAI({
      vertexai: true,
      project: projectId,
      location,
      googleAuthOptions: {
        credentials: {
          client_email: clientEmail,
          private_key: privateKey,
        },
      },
    });
  }

  // 2. Fallback to GEMINI_API_KEY
  if (process.env.GEMINI_API_KEY) {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  throw new Error("GCP Service Account yoki GEMINI_API_KEY sozlanmagan");
}

// Robust JSON parser with repair logic (ai-media-lab-app dagi kabi)
export function parseJSON(text) {
  let clean = text.trim().replace(/```json/g, "").replace(/```/g, "").trim();

  // 1. Direct parse
  try {
    return JSON.parse(clean);
  } catch (e) {
    // continue to repair
  }

  // 2. Extract JSON via regex
  const jsonMatch = clean.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (jsonMatch) {
    let snippet = jsonMatch[0];
    // 3. Repair common JSON errors
    snippet = snippet.replace(/"\s+"/g, '", "');
    snippet = snippet.replace(/"\s*\n\s*"/g, '", "');
    try {
      return JSON.parse(snippet);
    } catch {}
  }

  throw new Error("JSON formatini o'qib bo'lmadi");
}

// Retry logic (ai-media-lab-app dagi kabi)
export async function retry(fn, retries = 3, delay = 1000) {
  try {
    return await fn();
  } catch (error) {
    const msg = error?.message || JSON.stringify(error);
    const isServerError = error?.status === 500 || msg.includes("500") || msg.includes("overloaded");
    if (retries > 0 && isServerError) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return retry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

// CORS headers
export function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
