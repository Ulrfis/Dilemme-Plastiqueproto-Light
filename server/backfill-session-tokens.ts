import crypto from "crypto";
import { db } from "./db";
import { tutorialSessions } from "@shared/schema";
import { isNull, or, eq, sql } from "drizzle-orm";

/**
 * One-time backfill: assign an access token to every existing session that
 * has no meaningful token (NULL or empty string from the NOT NULL default).
 * This is awaited synchronously at startup so no tokenless sessions exist
 * when the server begins accepting requests.
 * Throws on failure so that startup is halted if isolation cannot be guaranteed.
 */
export async function backfillSessionTokens(): Promise<void> {
  const legacy = await db
    .select({ id: tutorialSessions.id })
    .from(tutorialSessions)
    .where(
      or(
        isNull(tutorialSessions.accessToken),
        eq(tutorialSessions.accessToken, '')
      )
    );

  if (legacy.length === 0) {
    return;
  }

  console.log(`[Backfill] Assigning access tokens to ${legacy.length} legacy session(s)...`);

  for (const row of legacy) {
    const token = crypto.randomBytes(16).toString('hex');
    await db
      .update(tutorialSessions)
      .set({ accessToken: token })
      .where(eq(tutorialSessions.id, row.id));
  }

  console.log(`[Backfill] Done — ${legacy.length} session(s) now have access tokens.`);
}
