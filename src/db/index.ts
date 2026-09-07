import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as schema from './schema';

declare global {
  var _postgresPool: Pool | undefined;
}

export const getPoolConfig = (): PoolConfig => {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (connectionString) {
    const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    return {
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 15000,
    };
  }

  return {
    host: process.env.SQL_HOST || 'localhost',
    port: process.env.SQL_PORT ? parseInt(process.env.SQL_PORT, 10) : 5432,
    user: process.env.SQL_USER || process.env.SQL_ADMIN_USER || 'postgres',
    password: process.env.SQL_PASSWORD || process.env.SQL_ADMIN_PASSWORD || '',
    database: process.env.SQL_DB_NAME || 'postgres',
    ssl: process.env.SQL_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 10,
    connectionTimeoutMillis: 15000,
  };
};

export const createPool = (): Pool => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool(getPoolConfig());

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

export const pool = createPool();
export const db = drizzle(pool, { schema });

let initPromise: Promise<void> | null = null;

export async function ensureTables(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const client = createPool();
        await client.query(`
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
        console.log("PostgreSQL: Jadvallar muvaffaqiyatli tekshirildi / yaratildi.");
      } catch (err: any) {
        console.warn("PostgreSQL: ensureTables eslatmasi:", err?.message || err);
      }
    })();
  }
  return initPromise;
}

