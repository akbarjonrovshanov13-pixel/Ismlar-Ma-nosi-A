import pg from "pg";
const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (connectionString) {
      const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
      pool = new Pool({
        connectionString,
        ssl: isLocal ? false : { rejectUnauthorized: false },
        max: 10,
        connectionTimeoutMillis: 15000,
      });
    } else if (process.env.SQL_HOST || process.env.SQL_DB_NAME) {
      pool = new Pool({
        host: process.env.SQL_HOST || "localhost",
        port: process.env.SQL_PORT ? parseInt(process.env.SQL_PORT, 10) : 5432,
        user: process.env.SQL_USER || process.env.SQL_ADMIN_USER || "postgres",
        password: process.env.SQL_PASSWORD || process.env.SQL_ADMIN_PASSWORD || "",
        database: process.env.SQL_DB_NAME || "postgres",
        ssl: process.env.SQL_SSL === "true" ? { rejectUnauthorized: false } : false,
        max: 10,
        connectionTimeoutMillis: 15000,
      });
    } else {
      // Default local connection fallback
      pool = new Pool({
        host: "localhost",
        port: 5432,
        user: "postgres",
        password: "",
        database: "ismlar_ai",
        max: 5,
        connectionTimeoutMillis: 5000,
      });
    }

    pool.on("error", (err) => {
      console.error("PostgreSQL pool error:", err.message);
    });
  }
  return pool;
}

let tablesEnsured = false;

export async function ensureTables() {
  if (tablesEnsured) return;
  const p = getPool();
  try {
    await p.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        uid TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        display_name TEXT,
        photo_url TEXT,
        credits INTEGER NOT NULL DEFAULT 3,
        total_allowed INTEGER NOT NULL DEFAULT 3,
        is_approved BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS videos (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_email TEXT,
        topic TEXT NOT NULL,
        full_script TEXT NOT NULL,
        script_json TEXT,
        hashtags_json TEXT,
        image_urls_json TEXT,
        caption_style TEXT,
        voice TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_email TEXT NOT NULL,
        display_name TEXT,
        plan_name TEXT NOT NULL,
        amount TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        approved_at TIMESTAMP
      );
    `);
    tablesEnsured = true;
    console.log("PostgreSQL: Jadvallar muvaffaqiyatli mavjudligi tekshirildi.");
  } catch (err) {
    console.warn("PostgreSQL: ensureTables bajarilmadi (baza sozlanmagan bo'lishi mumkin):", err.message);
    throw err;
  }
}

export async function query(text, params = []) {
  try {
    await ensureTables();
    const p = getPool();
    return await p.query(text, params);
  } catch (err) {
    console.error("PostgreSQL query xatosi:", err.message);
    throw err;
  }
}
