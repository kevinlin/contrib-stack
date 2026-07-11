type RateLimitEntry = {
  timestamps: number[];
};

export function createRateLimiter(maxRequests: number, windowMs: number) {
  const buckets = new Map<string, RateLimitEntry>();
  let lastCleanup = Date.now();

  function cleanup(now: number) {
    if (now - lastCleanup < windowMs) {
      return;
    }
    lastCleanup = now;
    for (const [key, entry] of buckets) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
      if (entry.timestamps.length === 0) {
        buckets.delete(key);
      }
    }
  }

  return {
    check(key: string): { allowed: boolean; retryAfterMs?: number } {
      const now = Date.now();
      cleanup(now);

      let entry = buckets.get(key);
      if (!entry) {
        entry = { timestamps: [] };
        buckets.set(key, entry);
      }

      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

      if (entry.timestamps.length >= maxRequests) {
        const oldest = entry.timestamps[0]!;
        return { allowed: false, retryAfterMs: windowMs - (now - oldest) };
      }

      entry.timestamps.push(now);
      return { allowed: true };
    },
    _reset() {
      buckets.clear();
      lastCleanup = Date.now();
    },
  };
}

let ingestRateLimiter = createRateLimiter(60, 60_000);

export function getIngestRateLimiter() {
  return ingestRateLimiter;
}

export function setIngestRateLimiterForTests(
  limiter: ReturnType<typeof createRateLimiter>,
) {
  ingestRateLimiter = limiter;
}

export function resetIngestRateLimiterForTests() {
  ingestRateLimiter = createRateLimiter(60, 60_000);
}
