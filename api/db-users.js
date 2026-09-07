import { query } from "./_db.js";
import { setCors } from "./_helpers.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // 1. GET: Get profile or all users for admin
    if (req.method === "GET") {
      const { uid, all } = req.query || {};

      // If 'all' is requested, return all users (for Admin modal)
      if (all === "true") {
        const result = await query(
          `SELECT id, uid, email, display_name, photo_url, credits, total_allowed, is_approved, created_at, updated_at
           FROM users
           ORDER BY created_at DESC`
        );

        const usersList = result.rows.map((row) => ({
          userId: row.uid,
          email: row.email,
          displayName: row.display_name || "Foydalanuvchi",
          photoURL: row.photo_url || "",
          credits: Number(row.credits) || 0,
          totalAllowed: Number(row.total_allowed) || 0,
          isApproved: Boolean(row.is_approved),
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        }));

        return res.status(200).json({ users: usersList });
      }

      if (!uid) {
        return res.status(400).json({ error: "uid maydoni kiritilishi shart" });
      }

      const result = await query(
        `SELECT id, uid, email, display_name, photo_url, credits, total_allowed, is_approved, created_at, updated_at
         FROM users
         WHERE uid = $1`,
        [uid]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ user: null });
      }

      const row = result.rows[0];
      return res.status(200).json({
        user: {
          userId: row.uid,
          email: row.email,
          displayName: row.display_name || "",
          photoURL: row.photo_url || "",
          credits: Number(row.credits) || 0,
          totalAllowed: Number(row.total_allowed) || 0,
          isApproved: Boolean(row.is_approved),
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        },
      });
    }

    // 2. POST: Upsert user on sign-in
    if (req.method === "POST") {
      const { uid, email, displayName, photoURL } = req.body || {};
      if (!uid || !email) {
        return res.status(400).json({ error: "uid va email shart" });
      }

      const isPrimaryAdmin = email.toLowerCase() === 'akbarjonrovshanov13@gmail.com';
      const initialCredits = isPrimaryAdmin ? 9999 : 0;
      const initialApproved = isPrimaryAdmin ? true : false;

      const upsertResult = await query(
        `INSERT INTO users (uid, email, display_name, photo_url, credits, total_allowed, is_approved, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5, $6, NOW(), NOW())
         ON CONFLICT (uid) DO UPDATE
         SET email = EXCLUDED.email,
             display_name = COALESCE(EXCLUDED.display_name, users.display_name),
             photo_url = COALESCE(EXCLUDED.photo_url, users.photo_url),
             updated_at = NOW()
         RETURNING id, uid, email, display_name, photo_url, credits, total_allowed, is_approved, created_at`,
        [uid, email, displayName || "", photoURL || "", initialCredits, initialApproved]
      );

      const row = upsertResult.rows[0];
      return res.status(200).json({
        success: true,
        user: {
          userId: row.uid,
          email: row.email,
          displayName: row.display_name,
          photoURL: row.photo_url,
          credits: Number(row.credits),
          totalAllowed: Number(row.total_allowed),
          isApproved: Boolean(row.is_approved),
          createdAt: row.created_at,
        },
      });
    }

    // 3. PATCH: Deduct credit (-1) or admin update credits
    if (req.method === "PATCH") {
      const { uid, action, credits, isApproved } = req.body || {};
      if (!uid) {
        return res.status(400).json({ error: "uid maydoni kiritilishi shart" });
      }

      if (action === "deduct") {
        // Decrement by 1, cannot go below 0
        const result = await query(
          `UPDATE users 
           SET credits = GREATEST(0, credits - 1),
               updated_at = NOW()
           WHERE uid = $1
           RETURNING credits`,
          [uid]
        );

        const newCredits = result.rows.length > 0 ? Number(result.rows[0].credits) : 0;
        return res.status(200).json({ success: true, credits: newCredits });
      }

      // Admin set credits or approval
      if (typeof credits === "number" || typeof isApproved === "boolean") {
        const result = await query(
          `UPDATE users 
           SET credits = COALESCE($2, credits),
               total_allowed = COALESCE($2, total_allowed),
               is_approved = COALESCE($3, is_approved),
               updated_at = NOW()
           WHERE uid = $1
           RETURNING uid, credits, total_allowed, is_approved`,
          [uid, credits !== undefined ? credits : null, isApproved !== undefined ? isApproved : null]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
        }

        return res.status(200).json({ success: true, user: result.rows[0] });
      }

      return res.status(400).json({ error: "Noto'g'ri patch amali" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("api/db-users xatosi:", err);
    return res.status(500).json({
      error: err.message || "Baza bilan aloqa o'rnatishda xatolik yuz berdi",
    });
  }
}
