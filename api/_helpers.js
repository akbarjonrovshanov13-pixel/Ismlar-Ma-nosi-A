import { GoogleGenAI } from "@google/genai";

// Vertex AI client — 100% GCP Vertex AI Service Account ($273+ credits)
// Service Account: vertex-sa@gen-lang-client-0604912271
export function getVertexAI(locationOverride) {
  const rawKey = process.env.GCP_PRIVATE_KEY || "";
  const privateKey = rawKey.replace(/\r/g, "").replace(/\\n/g, "\n");
  const clientEmail = process.env.GCP_CLIENT_EMAIL || "vertex-sa@gen-lang-client-0604912271.iam.gserviceaccount.com";
  const projectId = process.env.GCP_PROJECT_ID || "gen-lang-client-0604912271";
  const location = locationOverride || process.env.GCP_LOCATION || "global";

  if (privateKey && privateKey.includes("BEGIN PRIVATE KEY")) {
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

  throw new Error("GCP Service Account kaliti sozlanmagan");
}

// Robust JSON parser with repair logic
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

// Retry logic
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
