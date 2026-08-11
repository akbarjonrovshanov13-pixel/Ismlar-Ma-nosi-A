import { getVertexAI, setCors } from "./_helpers.js";
import { GoogleAuth } from "google-auth-library";

// Speech-to-Text V2. Uzbek is only served by the chirp family, chirp_2 is the variant that
// returns word timings, and the `global` location drops the offset on the very first word —
// so this pins us-central1/chirp_2. Raw PCM must use explicitDecodingConfig on its own;
// sending it alongside autoDecodingConfig is rejected.
const STT_REGION = "us-central1";
const STT_MODEL = "chirp_2";
const LANGUAGE = "uz-UZ";
const SAMPLE_RATE = 24000;

const parseOffset = (value) => (typeof value === "string" ? parseFloat(value.replace("s", "")) : 0) || 0;

export const config = { maxDuration: 60 };

// One audio chunk per call. The narration is ~5MB of raw PCM, well past the request body limit,
// so the client splits it and sends the pieces with the offset each one starts at.
export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { audioChunk, offsetSec } = req.body || {};
    if (!audioChunk) return res.status(400).json({ error: "audioChunk maydoni kerak" });

    // Reuse the service account the rest of the pipeline authenticates with.
    getVertexAI();
    const privateKey = (process.env.GCP_PRIVATE_KEY || "").replace(/\r/g, "").replace(/\\n/g, "\n");
    const auth = new GoogleAuth({
      credentials: { client_email: process.env.GCP_CLIENT_EMAIL, private_key: privateKey },
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const client = await auth.getClient();
    const project = process.env.GCP_PROJECT_ID;

    const response = await client.request({
      url: `https://${STT_REGION}-speech.googleapis.com/v2/projects/${project}/locations/${STT_REGION}/recognizers/_:recognize`,
      method: "POST",
      data: {
        config: {
          model: STT_MODEL,
          languageCodes: [LANGUAGE],
          features: { enableWordTimeOffsets: true },
          explicitDecodingConfig: { encoding: "LINEAR16", sampleRateHertz: SAMPLE_RATE, audioChannelCount: 1 },
        },
        content: audioChunk,
      },
    });

    const base = Number(offsetSec) || 0;
    const words = (response.data.results || [])
      .flatMap((r) => r.alternatives?.[0]?.words || [])
      .map((w) => ({
        word: w.word,
        start: parseOffset(w.startOffset) + base,
        end: parseOffset(w.endOffset) + base,
      }));

    return res.status(200).json({ words });
  } catch (err) {
    const detail = err?.response?.data?.error?.message || err.message || "";
    console.error("align-subtitles error:", detail.slice(0, 200));
    // Never block a video on alignment — the caller drops the timings and the player estimates.
    return res.status(200).json({ words: [], error: detail.slice(0, 120) });
  }
}
