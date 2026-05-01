// Tiny in-memory token-bucket rate limiter. Per-key tracking, no external
// dependency. Sufficient for single-instance deployments and a useful
// brute-force barrier on login. For multi-instance setups, swap the
// `buckets` map for a Redis-backed implementation.
//
// Usage:
//   const rl = createRateLimiter({ max: 10, windowMs: 60_000 });
//   const ok = rl.consume('login:' + ip);
//   if (!ok) return new NextResponse('too many requests', { status: 429 });

interface Bucket {
  tokens: number;
  resetAt: number;
}

interface Options {
  max: number;
  windowMs: number;
}

export interface RateLimiter {
  consume(key: string): boolean;
  remaining(key: string): number;
  reset(key: string): void;
}

const GC_EVERY_N_REQUESTS = 256;

export function createRateLimiter({ max, windowMs }: Options): RateLimiter {
  const buckets = new Map<string, Bucket>();
  let calls = 0;

  function gc(now: number) {
    buckets.forEach((b, k) => {
      if (b.resetAt <= now) buckets.delete(k);
    });
  }

  return {
    consume(key) {
      const now = Date.now();
      if (++calls % GC_EVERY_N_REQUESTS === 0) gc(now);
      const b = buckets.get(key);
      if (!b || b.resetAt <= now) {
        buckets.set(key, { tokens: max - 1, resetAt: now + windowMs });
        return true;
      }
      if (b.tokens <= 0) return false;
      b.tokens--;
      return true;
    },
    remaining(key) {
      const b = buckets.get(key);
      if (!b || b.resetAt <= Date.now()) return max;
      return b.tokens;
    },
    reset(key) {
      buckets.delete(key);
    },
  };
}

// Default limiters used by API routes.
export const loginLimiter = createRateLimiter({
  max: parseInt(process.env.LOGIN_RATE_LIMIT || '10', 10),
  windowMs: parseInt(process.env.LOGIN_RATE_WINDOW_MS || '60000', 10),
});

// Liberal default for general API surface — meant to slow scrapers, not
// real clients.
export const apiLimiter = createRateLimiter({
  max: parseInt(process.env.API_RATE_LIMIT || '300', 10),
  windowMs: parseInt(process.env.API_RATE_WINDOW_MS || '60000', 10),
});

// Pull a stable client identifier out of a request. Honours common proxy
// headers but never trusts the user-agent or unauthenticated body.
export function clientKey(request: Request | { headers: Headers }, prefix = ''): string {
  const h = (request as { headers: Headers }).headers;
  const fromHeader =
    h.get('x-forwarded-for')?.split(',')[0].trim() ||
    h.get('x-real-ip')?.trim() ||
    h.get('cf-connecting-ip')?.trim();
  return prefix + (fromHeader || 'unknown');
}
