import { env } from "@/server/env";

/**
 * Token-bucket rate limiter.
 *
 * The store is process-local by default, which is correct for a single-node
 * deployment and for the sandbox preview. In a horizontally scaled deployment
 * the same interface is backed by Redis (or Upstash) — only `consume` changes.
 */
type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.updatedAt > 10 * 60_000) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds: number;
};

export function consume(
  key: string,
  options: { max?: number; windowSeconds?: number } = {},
): RateLimitResult {
  const max = options.max ?? env.RATE_LIMIT_MAX_REQUESTS;
  const windowSeconds = options.windowSeconds ?? env.RATE_LIMIT_WINDOW_SECONDS;
  const now = Date.now();
  sweep(now);

  const refillRate = max / (windowSeconds * 1000); // tokens per ms
  const bucket = buckets.get(key) ?? { tokens: max, updatedAt: now };
  const elapsed = now - bucket.updatedAt;
  const tokens = Math.min(max, bucket.tokens + elapsed * refillRate);

  if (tokens < 1) {
    buckets.set(key, { tokens, updatedAt: now });
    return { allowed: false, remaining: 0, limit: max, retryAfterSeconds: Math.ceil((1 - tokens) / refillRate / 1000) };
  }

  buckets.set(key, { tokens: tokens - 1, updatedAt: now });
  return { allowed: true, remaining: Math.floor(tokens - 1), limit: max, retryAfterSeconds: 0 };
}

/** Auth endpoints are limited far more aggressively than regular reads. */
export const RATE_LIMITS = {
  authStrict: { max: 10, windowSeconds: 60 },
  auth: { max: 30, windowSeconds: 300 },
  write: { max: 120, windowSeconds: 60 },
  read: { max: 600, windowSeconds: 60 },
  export: { max: 20, windowSeconds: 300 },
} as const;

export function clientIp(request: Request) {
  const headers = request.headers;
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "127.0.0.1"
  );
}

export function rateLimitKey(scope: string, identifier: string) {
  return `${scope}:${identifier}`;
}
