import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: connectionString
    ? {
        url: connectionString,
      }
    : {
        host: process.env.SQL_HOST || "localhost",
        port: process.env.SQL_PORT ? parseInt(process.env.SQL_PORT, 10) : 5432,
        user: process.env.SQL_USER || process.env.SQL_ADMIN_USER || "postgres",
        password: process.env.SQL_PASSWORD || process.env.SQL_ADMIN_PASSWORD || "",
        database: process.env.SQL_DB_NAME || "postgres",
        ssl: process.env.SQL_SSL === "true",
      },
  verbose: true,
});

