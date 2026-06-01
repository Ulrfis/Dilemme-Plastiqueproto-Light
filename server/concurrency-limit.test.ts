import assert from 'node:assert/strict';
import test from 'node:test';
import { BoundedPriorityQueue, QueueOverloadedError } from './concurrency-limit.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('never runs more tasks than the configured concurrency', async () => {
  const queue = new BoundedPriorityQueue({ maxConcurrent: 2, maxQueued: 4 });
  const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
  let active = 0;
  let peak = 0;

  const tasks = gates.map((gate) => queue.run(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await gate.promise;
    active -= 1;
  }));

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active, 2);
  assert.equal(queue.getStats().queued, 1);

  gates[0].resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active, 2);
  assert.equal(peak, 2);

  gates[1].resolve();
  gates[2].resolve();
  await Promise.all(tasks);
});

test('starts foreground work before queued background work', async () => {
  const queue = new BoundedPriorityQueue({ maxConcurrent: 1, maxQueued: 4 });
  const gate = deferred<void>();
  const order: string[] = [];

  const running = queue.run(async () => {
    order.push('running');
    await gate.promise;
  });
  const background = queue.run(async () => {
    order.push('background');
  }, { priority: 'background' });
  const foreground = queue.run(async () => {
    order.push('foreground');
  });

  await new Promise((resolve) => setImmediate(resolve));
  gate.resolve();
  await Promise.all([running, background, foreground]);

  assert.deepEqual(order, ['running', 'foreground', 'background']);
});

test('rejects optional background work immediately while busy', async () => {
  const queue = new BoundedPriorityQueue({ maxConcurrent: 1, maxQueued: 4 });
  const gate = deferred<void>();
  const running = queue.run(() => gate.promise);

  await assert.rejects(
    queue.run(async () => undefined, {
      priority: 'background',
      dropIfBusy: true,
    }),
    QueueOverloadedError,
  );

  assert.equal(queue.getStats().droppedBackground, 1);
  gate.resolve();
  await running;
});
