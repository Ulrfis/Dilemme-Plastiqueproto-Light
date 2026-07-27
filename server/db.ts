import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function positiveIntFromEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

// Standard PostgreSQL works with Replit PostgreSQL, Neon and Coolify-managed
// PostgreSQL. DB_POOL_MAX defaults to 30 for a classroom-sized deployment.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: positiveIntFromEnv('DB_POOL_MAX', 30),
});
export const db = drizzle({ client: pool, schema });
