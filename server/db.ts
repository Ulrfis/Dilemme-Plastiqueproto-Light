import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

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

// Pool max is configurable via DB_POOL_MAX (default 30).
// This supports 30 simultaneous users without exhausting connections.
//
// ALTERNATIVE — Standard PostgreSQL (non-Neon):
// If deploying with a local PostgreSQL (e.g. Coolify-managed Postgres),
// replace this block with:
//
//   import { Pool } from 'pg';
//   import { drizzle } from 'drizzle-orm/node-postgres';
//   export const pool = new Pool({
//     connectionString: process.env.DATABASE_URL,
//     max: positiveIntFromEnv('DB_POOL_MAX', 30),
//   });
//   export const db = drizzle({ client: pool, schema });
//
// Then: npm install pg && npm install --save-dev @types/pg
// And:  npm uninstall @neondatabase/serverless ws
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: positiveIntFromEnv('DB_POOL_MAX', 30),
});
export const db = drizzle({ client: pool, schema });
