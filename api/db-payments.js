import { query } from "./_db.js";
import { setCors } from "./_helpers.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // 1. GET: List all payments (for Admin)
    if (req.method === "GET") {
      const result = await query(
        `SELECT id, user_id, user_email, display_name, plan_name, amount, status, created_at, approved_at
         FROM payments
         ORDER BY created_at DESC`
      );

      const payments = result.rows.map((row) => ({
        id: String(row.id),
        userId: row.user_id,
        userEmail: row.user_email,
        displayName: row.display_name || "Foydalanuvchi",
        planName: row.plan_name,
        amount: row.amount,
        status: row.status,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
      }));

      return res.status(200).json({ payments });
    }

    // 2. POST: Create new payment request (User buys a plan)
    if (req.method === "POST") {
      const { userId, userEmail, displayName, planName, amount } = req.body || {};
      if (!userId || !userEmail || !planName || !amount) {
        return res.status(400).json({ error: "Kerakli maydonlar to'ldirilmagan" });
      }

      const insertResult = await query(
        `INSERT INTO payments (user_id, user_email, display_name, plan_name, amount, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', NOW())
         RETURNING id, created_at`,
        [userId, userEmail, displayName || "Foydalanuvchi", planName, amount]
      );

      const created = insertResult.rows[0];
      return res.status(201).json({
        success: true,
        id: String(created.id),
        createdAt: created.created_at,
      });
    }

    // 3. PATCH: Admin approve or reject payment
    if (req.method === "PATCH") {
      const { paymentId, status, creditsToAdd } = req.body || {};
      if (!paymentId || !status) {
        return res.status(400).json({ error: "paymentId va status maydonlari shart" });
      }

      if (status === "APPROVED") {
        const updatePayment = await query(
          `UPDATE payments
           SET status = 'APPROVED', approved_at = NOW()
           WHERE id = $1
           RETURNING user_id`,
          [paymentId]
        );

        if (updatePayment.rows.length === 0) {
          return res.status(404).json({ error: "To'lov so'rovi topilmadi" });
        }

        const targetUserId = updatePayment.rows[0].user_id;
        const addAmount = Number(creditsToAdd) || 10;

        // Add credits to user
        await query(
          `UPDATE users
           SET credits = credits + $1,
               total_allowed = total_allowed + $1,
               is_approved = true,
               updated_at = NOW()
           WHERE uid = $2`,
          [addAmount, targetUserId]
        );

        return res.status(200).json({ success: true, status: "APPROVED", creditsAdded: addAmount });
      }

      if (status === "REJECTED") {
        await query(
          `UPDATE payments
           SET status = 'REJECTED'
           WHERE id = $1`,
          [paymentId]
        );

        return res.status(200).json({ success: true, status: "REJECTED" });
      }

      return res.status(400).json({ error: "Noma'lum to'lov statusi" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("api/db-payments xatosi:", err);
    return res.status(500).json({
      error: err.message || "Baza bilan aloqa o'rnatishda xatolik yuz berdi",
    });
  }
}
