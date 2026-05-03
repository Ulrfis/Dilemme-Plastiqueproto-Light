import { Agent, fetch as undiciFetch } from 'undici';

const elevenLabsAgent = new Agent({
  keepAliveTimeout: 35_000,
  keepAliveMaxTimeout: 300_000,
});

process.once('SIGTERM', () => elevenLabsAgent.close());
process.once('SIGINT', () => elevenLabsAgent.close());

export function elevenLabsFetch(
  url: string,
  options?: Parameters<typeof undiciFetch>[1]
): ReturnType<typeof undiciFetch> {
  return undiciFetch(url, {
    ...options,
    dispatcher: elevenLabsAgent,
  });
}

export interface PoolStatsSnapshot {
  origins: number;
  connected: number;
  free: number;
  pending: number;
  queued: number;
  running: number;
  size: number;
  byOrigin: Record<string, {
    connected: number;
    free: number;
    pending: number;
    queued: number;
    running: number;
    size: number;
  }>;
}

export interface PoolStatsSample extends PoolStatsSnapshot {
  timestamp: number;
}

function safeNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function getPoolStats(): PoolStatsSnapshot {
  const stats = (elevenLabsAgent as unknown as { stats?: Record<string, Record<string, unknown>> }).stats || {};
  const byOrigin: PoolStatsSnapshot['byOrigin'] = {};
  const totals = { connected: 0, free: 0, pending: 0, queued: 0, running: 0, size: 0 };
  let origins = 0;
  for (const [origin, s] of Object.entries(stats)) {
    origins += 1;
    const entry = {
      connected: safeNum(s.connected),
      free: safeNum(s.free),
      pending: safeNum(s.pending),
      queued: safeNum(s.queued),
      running: safeNum(s.running),
      size: safeNum(s.size),
    };
    byOrigin[origin] = entry;
    totals.connected += entry.connected;
    totals.free += entry.free;
    totals.pending += entry.pending;
    totals.queued += entry.queued;
    totals.running += entry.running;
    totals.size += entry.size;
  }
  return { origins, ...totals, byOrigin };
}

// Shared cadence for the ElevenLabs warming tick + pool sampling.
export const POOL_SAMPLE_INTERVAL_MS = 30_000;
// Ring buffer of recent pool samples — 60 samples = 30 min at 30s tick.
export const POOL_HISTORY_CAPACITY = 60;
const poolHistory: PoolStatsSample[] = [];

export function recordPoolSample(): PoolStatsSample {
  const sample: PoolStatsSample = { timestamp: Date.now(), ...getPoolStats() };
  poolHistory.push(sample);
  if (poolHistory.length > POOL_HISTORY_CAPACITY) {
    poolHistory.splice(0, poolHistory.length - POOL_HISTORY_CAPACITY);
  }
  return sample;
}

export function getPoolHistory(): PoolStatsSample[] {
  return poolHistory.slice();
}
