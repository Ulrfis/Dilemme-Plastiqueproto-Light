import assert from "node:assert/strict";
import test from "node:test";
import { checkDatabaseHealth } from "./database-health.ts";

test("reports a healthy database", async () => {
  const result = await checkDatabaseHealth({
    query: async () => ({ rows: [{ "?column?": 1 }] }),
  });

  assert.equal(result.ok, true);
  assert.ok(result.latencyMs >= 0);
});

test("reports an unavailable database without leaking its error", async () => {
  const result = await checkDatabaseHealth({
    query: async () => {
      throw new Error("password authentication failed for secret-user");
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result).sort(), ["latencyMs", "ok"]);
});

test("times out a stalled database check", async () => {
  const result = await checkDatabaseHealth(
    { query: () => new Promise(() => undefined) },
    1,
  );

  assert.equal(result.ok, false);
});
