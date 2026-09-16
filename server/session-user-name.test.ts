import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSessionUserName } from "./session-user-name.ts";

test("normalizes extra whitespace in the entered session name", () => {
  assert.equal(normalizeSessionUserName("  Jean   Luc  "), "Jean Luc");
});

test("rejects a session name that is blank after trimming", () => {
  assert.throws(
    () => normalizeSessionUserName("   "),
    /must not be blank/,
  );
});
