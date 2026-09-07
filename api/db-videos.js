import { query } from "./_db.js";
import { setCors } from "./_helpers.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // 1. GET: Fetch saved videos for a user
    if (req.method === "GET") {
      const { userId } = req.query || {};
      if (!userId) {
        return res.status(400).json({ error: "userId parametri kiritilishi shart" });
      }

      const result = await query(
        `SELECT id, user_id, user_email, topic, full_script, script_json, hashtags_json, 
                image_urls_json, caption_style, voice, created_at 
         FROM videos 
         WHERE user_id = $1 
         ORDER BY created_at DESC`,
        [userId]
      );

      const videos = result.rows.map((row) => ({
        id: String(row.id),
        userId: row.user_id,
        userEmail: row.user_email || "",
        topic: row.topic,
        fullScript: row.full_script,
        script: row.script_json ? JSON.parse(row.script_json) : [],
        hashtags: row.hashtags_json ? JSON.parse(row.hashtags_json) : [],
        imageUrls: row.image_urls_json ? JSON.parse(row.image_urls_json) : [],
        captionStyle: row.caption_style || "TIKTOK_YELLOW",
        voice: row.voice || "Friendly",
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      }));

      return res.status(200).json({ videos });
    }

    // 2. POST: Save a new video
    if (req.method === "POST") {
      const {
        userId,
        userEmail,
        topic,
        fullScript,
        script,
        hashtags,
        imageUrls,
        captionStyle,
        voice,
      } = req.body || {};

      if (!userId || !topic || !fullScript) {
        return res.status(400).json({ error: "userId, topic va fullScript maydonlari shart" });
      }

      const scriptJson = Array.isArray(script) ? JSON.stringify(script) : "[]";
      const hashtagsJson = Array.isArray(hashtags) ? JSON.stringify(hashtags) : "[]";
      const imageUrlsJson = Array.isArray(imageUrls) ? JSON.stringify(imageUrls) : "[]";

      const insertResult = await query(
        `INSERT INTO videos 
         (user_id, user_email, topic, full_script, script_json, hashtags_json, image_urls_json, caption_style, voice, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         RETURNING id, created_at`,
        [
          userId,
          userEmail || "Anonym",
          topic,
          fullScript,
          scriptJson,
          hashtagsJson,
          imageUrlsJson,
          captionStyle || "TIKTOK_YELLOW",
          voice || "Friendly",
        ]
      );

      const saved = insertResult.rows[0];
      return res.status(201).json({
        success: true,
        id: String(saved.id),
        createdAt: saved.created_at,
      });
    }

    // 3. DELETE: Delete a saved video
    if (req.method === "DELETE") {
      const { id, userId } = req.query || {};
      const body = req.body || {};
      const targetId = id || body.id;
      const targetUserId = userId || body.userId;

      if (!targetId || !targetUserId) {
        return res.status(400).json({ error: "id va userId parametrlari kerak" });
      }

      await query(`DELETE FROM videos WHERE id = $1 AND user_id = $2`, [targetId, targetUserId]);

      return res.status(200).json({ success: true, deletedId: targetId });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("api/db-videos xatosi:", err);
    return res.status(500).json({
      error: err.message || "Baza bilan aloqa o'rnatishda xatolik yuz berdi",
    });
  }
}
