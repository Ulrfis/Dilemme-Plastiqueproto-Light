import assert from "node:assert/strict";
import test from "node:test";
import { ChatAdmissionTimeoutError, ChatTurnConflictError, ChatTurnController } from "./chat-turn-control.ts";

test("allows only one active or queued turn per session", async () => {
  const controller = new ChatTurnController(1, 2, 100);
  const lease = await controller.acquire("session-a", "turn-1");
  await assert.rejects(controller.acquire("session-a", "turn-2"), ChatTurnConflictError);
  lease.release();
});
test("queues another session and releases it in order", async () => {
  const controller = new ChatTurnController(1, 2, 100);
  const first = await controller.acquire("session-a", "turn-1");
  const secondPromise = controller.acquire("session-b", "turn-2");
  assert.equal(controller.getStats().queued, 1);
  first.release();
  const second = await secondPromise;
  assert.equal(second.isCurrent(), true);
  second.release();
});

test("times out queued work and invalidates cancelled leases", async () => {
  const controller = new ChatTurnController(1, 1, 5);
  const first = await controller.acquire("session-a", "turn-1");
  await assert.rejects(controller.acquire("session-b", "turn-2"), ChatAdmissionTimeoutError);
  first.cancel();
  assert.equal(first.isCurrent(), false);
  first.release();
});
