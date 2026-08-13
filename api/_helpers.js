import { GoogleGenAI } from "@google/genai";

// In-memory cache for generated images to reduce API calls and save quota
const imageCache = new Map();
const MAX_CACHE_SIZE = 100;

export function getCachedImage(key) {
  return imageCache.get(key) || null;
}

export function setCachedImage(key, data) {
  if (imageCache.size >= MAX_CACHE_SIZE) {
    const firstKey = imageCache.keys().next().value;
    imageCache.delete(firstKey);
  }
  imageCache.set(key, data);
}

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

  // Fallback to direct Gemini API key if GCP private key is missing
  if (process.env.GEMINI_API_KEY) {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  throw new Error("GCP Service Account kaliti sozlanmagan");
}

/**
 * Pollinations AI image generator fallback.
 * 100% free, open access text-to-image API without requiring any API keys or credentials.
 * Returns base64 data URI (data:image/jpeg;base64,...).
 */
export async function fetchPollinationsImage(prompt, width = 768, height = 1344) {
  try {
    const seed = Math.floor(Math.random() * 10000000);
    const cleanPrompt = encodeURIComponent(String(prompt).slice(0, 400));
    const url = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=true`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 14000); // 14s timeout

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Pollinations AI returned HTTP status ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    if (!buffer || buffer.byteLength < 500) {
      throw new Error("Pollinations AI returned empty or invalid image buffer");
    }

    const base64 = Buffer.from(buffer).toString("base64");
    const mimeType = response.headers.get("content-type") || "image/jpeg";
    return `data:${mimeType};base64,${base64}`;
  } catch (err) {
    console.warn("Pollinations AI fallback failed:", err.message);
    return null;
  }
}

/**
 * Executes a request with automatic multi-model and multi-region quota fallback.
 * If a model (e.g. gemini-2.5-flash-image) or region hits 429 (RESOURCE_EXHAUSTED) or is unavailable,
 * this automatically cascades through fallback models (imagen-3.0-generate-002, imagen-3.0-fast-generate-001, gemini-3.1-flash-lite-image)
 * and across GCP regions.
 */
export async function executeWithQuotaFallback(
  apiRunner,
  models = [
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-lite-image",
    "imagen-3.0-generate-002",
    "imagen-3.0-fast-generate-001"
  ]
) {
  const defaultLoc = process.env.GCP_LOCATION || "global";
  const locations = [
    defaultLoc,
    "us-central1",
    "us-east4",
    "europe-west1",
    "asia-east1",
    "us-west1",
  ];
  const uniqueLocations = [...new Set(locations)];
  let lastError = null;

  for (const model of models) {
    for (const loc of uniqueLocations) {
      try {
        const ai = getVertexAI(loc);
        return await apiRunner(ai, loc, model);
      } catch (err) {
        lastError = err;
        const msg = err?.message || "";
        const isQuota = /429|RESOURCE_EXHAUSTED|Quota exceeded/i.test(msg);
        const isNotFoundOrUnsupported = /NOT_FOUND|404|not found|not supported|invalid/i.test(msg);
        if (isQuota || isNotFoundOrUnsupported) {
          console.warn(`Model "${model}" at location "${loc}" failed (${msg}), attempting next fallback...`);
          continue;
        }
        throw err; // Re-throw fatal non-quota errors immediately
      }
    }
  }

  // Direct GEMINI_API_KEY fallback as last resort across models
  if (process.env.GEMINI_API_KEY) {
    for (const model of models) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        return await apiRunner(ai, "direct-api", model);
      } catch (err) {
        console.warn(`Direct GEMINI_API_KEY fallback with model "${model}" failed:`, err.message);
      }
    }
  }

  throw lastError;
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
