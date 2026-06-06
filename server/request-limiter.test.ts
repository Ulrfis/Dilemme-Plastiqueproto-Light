import assert from 'node:assert/strict';
import test from 'node:test';
import { createRateLimiter, positiveIntFromEnv, requestIdentity } from './request-limiter.ts';

function createReq(overrides: Record<string, unknown> = {}) {
  return {
    headers: {},
    body: {},
    params: {},
    path: '/api/example',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  };
}

function createRes() {
  return {
    headers: {} as Record<string, string>,
    statusCode: 200,
    body: undefined as unknown,
    set(name: string, value: string) {
      this.headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

test('requestIdentity prefers session-scoped identifiers before IP fallback', () => {
  assert.equal(requestIdentity(createReq({ headers: { 'x-session-token': 'header-token' } })), 'session:header-token');
  assert.equal(requestIdentity(createReq({ body: { accessToken: 'body-token' } })), 'session:body-token');
  assert.equal(requestIdentity(createReq({ body: { sessionId: 'session-id' } })), 'session:session-id');
});

test('requestIdentity falls back to tts token, route token, then socket IP', () => {
  assert.equal(requestIdentity(createReq({ path: '/tts/play/audio-token' })), 'tts:audio-token');
  assert.equal(requestIdentity(createReq({ params: { token: 'route-token' } })), 'token:route-token');
  assert.equal(requestIdentity(createReq({ ip: undefined, socket: { remoteAddress: '10.0.0.5' } })), 'ip:10.0.0.5');
});

test('createRateLimiter keeps per-session buckets separate even on the same IP', () => {
  const limiter = createRateLimiter(1, 60_000);
  const nextCalls: string[] = [];

  const firstReq = createReq({ headers: { 'x-session-token': 'session-a' }, ip: '203.0.113.9' });
  const secondReq = createReq({ headers: { 'x-session-token': 'session-b' }, ip: '203.0.113.9' });

  limiter(firstReq, createRes(), () => nextCalls.push('a'));
  limiter(secondReq, createRes(), () => nextCalls.push('b'));

  assert.deepEqual(nextCalls, ['a', 'b']);
});

test('createRateLimiter returns 429 with Retry-After once a bucket overflows', () => {
  const limiter = createRateLimiter(1, 10_000);
  const req = createReq({ path: '/tts/play/shared-audio' });

  limiter(req, createRes(), () => undefined);

  const res = createRes();
  let nextCalled = false;
  limiter(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['Retry-After'], '10');
  assert.deepEqual(res.body, { error: 'Rate limit exceeded' });
});

test('createRateLimiter resets the bucket after the time window elapses', async () => {
  const realNow = Date.now;
  let now = 1_000;
  Date.now = () => now;

  try {
    const limiter = createRateLimiter(1, 5_000);
    let nextCalls = 0;
    const req = createReq({ headers: { 'x-session-token': 'reset-me' } });

    limiter(req, createRes(), () => {
      nextCalls += 1;
    });
    now += 5_001;
    limiter(req, createRes(), () => {
      nextCalls += 1;
    });

    assert.equal(nextCalls, 2);
  } finally {
    Date.now = realNow;
  }
});

test('positiveIntFromEnv accepts only positive integers and otherwise uses fallback', () => {
  const original = process.env.TEST_LIMITER_VALUE;

  try {
    process.env.TEST_LIMITER_VALUE = '7';
    assert.equal(positiveIntFromEnv('TEST_LIMITER_VALUE', 3), 7);

    process.env.TEST_LIMITER_VALUE = '0';
    assert.equal(positiveIntFromEnv('TEST_LIMITER_VALUE', 3), 3);

    process.env.TEST_LIMITER_VALUE = 'not-a-number';
    assert.equal(positiveIntFromEnv('TEST_LIMITER_VALUE', 3), 3);
  } finally {
    if (original === undefined) delete process.env.TEST_LIMITER_VALUE;
    else process.env.TEST_LIMITER_VALUE = original;
  }
});
