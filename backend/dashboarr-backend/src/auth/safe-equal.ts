import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison for operator-chosen secrets (webhook secret,
 * web UI password). Length is compared first: timingSafeEqual throws on
 * mismatched lengths, and leaking the length of a secret is acceptable.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
