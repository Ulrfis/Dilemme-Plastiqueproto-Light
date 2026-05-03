// Server-side PostHog instrumentation (Task #34).
// Mirrors the client-side `api_error` / failure events from server/routes.ts so
// that backend-only failures (TTS timeouts, OpenAI throttling, SSE crashes…)
// are visible in PostHog within ~1min, not just when a user happens to surface
// them.
//
// Reuses the same EU project as the client (POSTHOG_API_KEY = phc_… ingest key).
import { PostHog } from "posthog-node";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (client !== null) return client;
  const key = process.env.POSTHOG_API_KEY;
  if (!key) {
    console.warn("[PostHog Server] POSTHOG_API_KEY not set — server-side events disabled");
    return null;
  }
  client = new PostHog(key, {
    host: "https://eu.i.posthog.com",
    flushAt: 1,           // small volume, send immediately
    flushInterval: 10_000, // safety net every 10s
  });
  client.on("error", (err: unknown) => {
    console.warn("[PostHog Server] capture error:", err instanceof Error ? err.message : err);
  });
  console.log("[PostHog Server] ✅ Initialized (eu.i.posthog.com)");
  return client;
}

/**
 * Capture a server-side event. Safe to call from any error path — it never
 * throws and never blocks (PostHog SDK queues + flushes in background).
 *
 * @param event       Event name. Convention: snake_case, prefer `server_*`
 *                    for server-only events; reuse `api_error` so it sits in
 *                    the same dashboard widget as the client one.
 * @param sessionId   Tutorial session UUID. Used as distinct_id so events
 *                    join the same person timeline as the client events.
 * @param properties  Extra properties (endpoint, error_message, http_status…).
 *                    Always tag with `source: 'server'` automatically.
 * @param userName    Optional — if known, sent as `user_name`.
 */
export function captureServerEvent(
  event: string,
  sessionId: string | null | undefined,
  properties: Record<string, unknown> = {},
  userName?: string | null,
): void {
  try {
    const ph = getClient();
    if (!ph) return;
    ph.capture({
      // Anonymous events still need a distinctId; fall back to a stable bucket id.
      distinctId: sessionId || "server-anonymous",
      event,
      properties: {
        source: "server",
        session_id: sessionId || undefined,
        user_name: userName || undefined,
        env: process.env.NODE_ENV || "development",
        ...properties,
      },
    });
  } catch (err) {
    console.warn("[PostHog Server] captureServerEvent threw (silent):", err instanceof Error ? err.message : err);
  }
}

/**
 * Convenience helper for caught errors. Truncates message to keep PostHog
 * properties small and avoid leaking entire stack traces in production.
 */
export function captureServerError(
  endpoint: string,
  sessionId: string | null | undefined,
  error: unknown,
  extra: Record<string, unknown> = {},
  userName?: string | null,
): void {
  const msg = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "Unknown";
  captureServerEvent(
    "api_error",
    sessionId,
    {
      endpoint,
      error_name: name,
      error_message: msg.slice(0, 500),
      ...extra,
    },
    userName,
  );
}

/** Flush pending events before process exit. */
export async function shutdownPostHog(): Promise<void> {
  if (!client) return;
  try {
    await client.shutdown();
  } catch (err) {
    console.warn("[PostHog Server] shutdown error:", err);
  }
}
