type RateEntry = { count: number; resetAt: number };

export function requestIdentity(req: any): string {
  const sessionToken = req.headers["x-session-token"] || req.body?.accessToken || req.body?.sessionId;
  if (sessionToken) return `session:${String(sessionToken)}`;
  if (typeof req.path === 'string' && req.path.startsWith('/tts/play/')) {
    return `tts:${req.path.slice('/tts/play/'.length)}`;
  }
  if (req.params?.token) return `token:${String(req.params.token)}`;
  return `ip:${String(req.ip || req.socket?.remoteAddress || "unknown")}`;
}

export function createRateLimiter(maxRequests: number, windowMs: number) {
  const buckets = new Map<string, RateEntry>();
  let lastPurge = Date.now();

  return function rateLimiter(req: any, res: any, next: any) {
    const key = requestIdentity(req);
    const now = Date.now();

    // Purge expired entries every 5 minutes to prevent unbounded memory growth
    if (now - lastPurge > 5 * 60 * 1000) {
      for (const [k, v] of buckets) {
        if (now > v.resetAt) buckets.delete(k);
      }
      lastPurge = now;
    }

    const entry = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }

    entry.count += 1;
    buckets.set(key, entry);

    if (entry.count > maxRequests) {
      const retryAfter = Math.max(0, Math.ceil((entry.resetAt - now) / 1000));
      res.set("Retry-After", retryAfter.toString());
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    next();
  };
}

export function positiveIntFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
