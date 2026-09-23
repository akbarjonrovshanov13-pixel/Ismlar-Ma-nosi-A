import { query, getPool } from "./_db.js";
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
        const p = await getPool();
        const poolAvailable = Boolean(p);
        const result = await query(
          `SELECT id, uid, email, display_name, photo_url, phone, claimed_telegram_bonus, credits, total_allowed, is_approved, created_at, updated_at
           FROM users
           ORDER BY created_at DESC`
        );

        const usersList = result.rows.map((row) => ({
          userId: row.uid,
          email: row.email,
          displayName: row.display_name || "Foydalanuvchi",
          photoURL: row.photo_url || "",
          phone: row.phone || "",
          claimedTelegramBonus: Boolean(row.claimed_telegram_bonus),
          credits: Number(row.credits) || 0,
          totalAllowed: Number(row.total_allowed) || 0,
          isApproved: Boolean(row.is_approved),
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        }));

        return res.status(200).json({ 
          users: usersList,
          dbConnected: poolAvailable,
          dbStatus: poolAvailable ? "PostgreSQL ulangan" : "PostgreSQL ulanmagan"
        });
      }

      if (!uid) {
        return res.status(400).json({ error: "uid maydoni kiritilishi shart" });
      }

      const { email: queryEmail, displayName: queryName, photoURL: queryPhoto } = req.query || {};

      const result = await query(
        `SELECT id, uid, email, display_name, photo_url, phone, claimed_telegram_bonus, credits, total_allowed, is_approved, created_at, updated_at
         FROM users
         WHERE uid = $1`,
        [uid]
      );

      if (result.rows.length === 0) {
        // Auto-create user in PostgreSQL so they immediately exist in database!
        const safeEmail = (queryEmail && queryEmail.trim()) || `${uid}@user.ismlar.ai`;
        const isPrimaryAdmin = safeEmail.toLowerCase() === 'akbarjonrovshanov13@gmail.com' || uid === 'admin_akbarjon';
        const initialCredits = isPrimaryAdmin ? 9999 : 0;

        const insertRes = await query(
          `INSERT INTO users (uid, email, display_name, photo_url, credits, total_allowed, is_approved, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $5, true, NOW(), NOW())
           ON CONFLICT (uid) DO UPDATE SET updated_at = NOW()
           RETURNING id, uid, email, display_name, photo_url, phone, claimed_telegram_bonus, credits, total_allowed, is_approved, created_at`,
          [uid, safeEmail, queryName || (isPrimaryAdmin ? "Admin (Akbarjon)" : "Foydalanuvchi"), queryPhoto || "", initialCredits]
        );

        const row = insertRes.rows[0];
        if (row) {
          return res.status(200).json({
            user: {
              userId: row.uid,
              email: row.email,
              displayName: row.display_name || "",
              photoURL: row.photo_url || "",
              phone: row.phone || "",
              claimedTelegramBonus: Boolean(row.claimed_telegram_bonus),
              credits: Number(row.credits) || initialCredits,
              totalAllowed: Number(row.total_allowed) || initialCredits,
              isApproved: Boolean(row.is_approved),
              createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            },
          });
        }
      }

      const row = result.rows[0];
      return res.status(200).json({
        user: {
          userId: row.uid,
          email: row.email,
          displayName: row.display_name || "",
          photoURL: row.photo_url || "",
          phone: row.phone || "",
          claimedTelegramBonus: Boolean(row.claimed_telegram_bonus),
          credits: Number(row.credits) || 0,
          totalAllowed: Number(row.total_allowed) || 0,
          isApproved: Boolean(row.is_approved),
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        },
      });
    }

    // 2. POST: Upsert user on sign-in
    if (req.method === "POST") {
      const { uid, email, displayName, photoURL, phone } = req.body || {};
      if (!uid) {
        return res.status(400).json({ error: "uid maydoni shart" });
      }

      const safeEmail = (email && email.trim()) || `${uid}@user.ismlar.ai`;
      const isPrimaryAdmin = safeEmail.toLowerCase() === 'akbarjonrovshanov13@gmail.com' || uid === 'admin_akbarjon';
      const initialCredits = isPrimaryAdmin ? 9999 : 0;
      const initialApproved = true;

      const upsertResult = await query(
        `INSERT INTO users (uid, email, display_name, photo_url, phone, credits, total_allowed, is_approved, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6, $7, NOW(), NOW())
         ON CONFLICT (uid) DO UPDATE
         SET email = CASE 
                       WHEN EXCLUDED.email NOT LIKE '%@user.ismlar.ai' THEN EXCLUDED.email 
                       ELSE users.email 
                     END,
             display_name = CASE 
                              WHEN EXCLUDED.display_name != '' AND EXCLUDED.display_name != 'Foydalanuvchi' THEN EXCLUDED.display_name 
                              ELSE users.display_name 
                            END,
             photo_url = COALESCE(NULLIF(EXCLUDED.photo_url, ''), users.photo_url),
             phone = COALESCE(NULLIF(EXCLUDED.phone, ''), users.phone),
             updated_at = NOW()
         RETURNING id, uid, email, display_name, photo_url, phone, claimed_telegram_bonus, credits, total_allowed, is_approved, created_at`,
        [uid, safeEmail, displayName || "", photoURL || "", phone || null, initialCredits, initialApproved]
      );

      const row = upsertResult.rows[0] || {
        uid,
        email: safeEmail,
        display_name: displayName || "Foydalanuvchi",
        photo_url: photoURL || "",
        phone: phone || "",
        claimed_telegram_bonus: false,
        credits: initialCredits,
        total_allowed: initialCredits,
        isApproved: initialApproved,
        createdAt: new Date().toISOString(),
      };

      return res.status(200).json({
        success: true,
        user: {
          userId: row.uid,
          email: row.email,
          displayName: row.display_name,
          photoURL: row.photo_url,
          phone: row.phone || "",
          claimedTelegramBonus: Boolean(row.claimed_telegram_bonus),
          credits: Number(row.credits),
          totalAllowed: Number(row.total_allowed),
          isApproved: Boolean(row.is_approved),
          createdAt: row.created_at,
        },
      });
    }

    // 3. PATCH: Deduct credit (-1), claim Telegram bonus, update profile or admin update
    if (req.method === "PATCH") {
      const { uid, action, credits, isApproved, email, displayName, phone } = req.body || {};
      if (!uid) {
        return res.status(400).json({ error: "uid maydoni kiritilishi shart" });
      }

      if (action === "update_profile") {
        const cleanPhone = phone ? phone.trim().replace(/[^\d+]/g, '') : null;
        const result = await query(
          `UPDATE users 
           SET phone = COALESCE($2, phone),
               display_name = CASE WHEN $3 != '' THEN $3 ELSE display_name END,
               updated_at = NOW()
           WHERE uid = $1
           RETURNING phone, display_name`,
          [uid, cleanPhone, (displayName || "").trim()]
        );
        return res.status(200).json({ success: true, user: result.rows[0] });
      }

      if (action === "claim_bonus") {
        const checkRes = await query(`SELECT credits, total_allowed, phone, claimed_telegram_bonus FROM users WHERE uid = $1`, [uid]);
        if (checkRes.rows.length === 0) {
          return res.status(404).json({ success: false, error: "Foydalanuvchi topilmadi", granted: false });
        }
        
        const userRow = checkRes.rows[0];
        if (userRow.claimed_telegram_bonus) {
          return res.status(200).json({ 
            success: false, 
            error: "Ushbu Google akkaunt orqali allaqachon bepul video olingan!", 
            credits: Number(userRow.credits),
            granted: false 
          });
        }

        // Validate unique phone number to prevent repeated fake claims
        const cleanPhone = phone ? phone.trim().replace(/[^\d+]/g, '') : (userRow.phone || null);
        if (cleanPhone) {
          const phoneCheck = await query(
            `SELECT uid FROM users WHERE phone = $1 AND claimed_telegram_bonus = true AND uid != $2`,
            [cleanPhone, uid]
          );
          if (phoneCheck.rows.length > 0) {
            return res.status(200).json({ 
              success: false, 
              error: "Ushbu telefon raqami orqali allaqachon bepul video olingan! Har bir raqamga faqat 1 marta bepul video beriladi.", 
              credits: Number(userRow.credits),
              granted: false 
            });
          }
        }

        // Grant 1 free video credit, record phone, set claimed_telegram_bonus = true
        const result = await query(
          `UPDATE users 
           SET credits = credits + 1,
               total_allowed = total_allowed + 1,
               claimed_telegram_bonus = true,
               phone = COALESCE($2, phone),
               display_name = CASE WHEN $3 != '' THEN $3 ELSE display_name END,
               updated_at = NOW()
           WHERE uid = $1
           RETURNING credits, total_allowed, phone, claimed_telegram_bonus, display_name`,
          [uid, cleanPhone, (displayName || "").trim()]
        );
        const updatedRow = result.rows[0];
        return res.status(200).json({ 
          success: true, 
          credits: Number(updatedRow.credits), 
          phone: updatedRow.phone,
          claimedTelegramBonus: Boolean(updatedRow.claimed_telegram_bonus),
          granted: true 
        });
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

      // Admin set credits, approval, email or displayName
      if (email !== undefined || displayName !== undefined || typeof credits === "number" || typeof isApproved === "boolean") {
        const result = await query(
          `UPDATE users 
           SET email = COALESCE(NULLIF($2, ''), email),
               display_name = COALESCE(NULLIF($3, ''), display_name),
               credits = COALESCE($4, credits),
               total_allowed = COALESCE($4, total_allowed),
               is_approved = COALESCE($5, is_approved),
               updated_at = NOW()
           WHERE uid = $1
           RETURNING uid, email, display_name, credits, total_allowed, is_approved`,
          [
            uid,
            email ? email.trim().toLowerCase() : null,
            displayName ? displayName.trim() : null,
            credits !== undefined ? credits : null,
            isApproved !== undefined ? isApproved : null,
          ]
        );

        const row = result.rows[0] || {
          uid,
          email: email || '',
          display_name: displayName || '',
          credits: credits ?? 3,
          total_allowed: credits ?? 3,
          is_approved: isApproved ?? true,
        };

        return res.status(200).json({ success: true, user: row });
      }

      return res.status(400).json({ error: "Noto'g'ri patch amali" });
    }

    // 4. DELETE: Admin delete user
    if (req.method === "DELETE") {
      const { uid } = req.query || req.body || {};
      if (!uid) {
        return res.status(400).json({ error: "uid maydoni kiritilishi shart" });
      }

      await query(`DELETE FROM users WHERE uid = $1`, [uid]);
      return res.status(200).json({ success: true, message: "Foydalanuvchi o'chirildi" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("api/db-users xatosi:", err);
    return res.status(500).json({
      error: err.message || "Baza bilan aloqa o'rnatishda xatolik yuz berdi",
    });
  }
}
