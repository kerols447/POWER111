interface Bucket {
  count: number;
  resetAt: number;
}

// Failed logins are counted per identifier in memory only — no shared cache to rent. The
// map is swept as it grows, otherwise an attacker spraying random usernames would grow it
// forever and take the server down with its own memory.
export interface LoginThrottle {
  blocked(key: string): boolean;
  record(key: string): void;
  clear(key: string): void;
}

export function createLoginThrottle(maxAttempts: number, windowMs: number, maxKeys = 5000): LoginThrottle {
  const buckets = new Map<string, Bucket>();

  const sweep = () => {
    if (buckets.size < maxKeys) return;
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    // Still full of live windows: start over rather than grow without end.
    if (buckets.size >= maxKeys) buckets.clear();
  };

  return {
    blocked(key: string): boolean {
      const entry = buckets.get(key);
      if (!entry) return false;
      if (Date.now() > entry.resetAt) {
        buckets.delete(key);
        return false;
      }
      return entry.count >= maxAttempts;
    },
    record(key: string): void {
      sweep();
      const entry = buckets.get(key);
      if (!entry || Date.now() > entry.resetAt) {
        buckets.set(key, { count: 1, resetAt: Date.now() + windowMs });
      } else {
        entry.count += 1;
      }
    },
    clear(key: string): void {
      buckets.delete(key);
    }
  };
}
