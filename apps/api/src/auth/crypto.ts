import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** URL-safe random token with `bytes` bytes of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const API_KEY_PREFIX = 'bcms';

/** `bcms_<8 hex prefix>_<secret>`; the prefix is safe to display. */
export function generateApiKey(): { key: string; prefix: string } {
  const id = randomBytes(4).toString('hex');
  const prefix = `${API_KEY_PREFIX}_${id}`;
  return { key: `${prefix}_${randomToken(32)}`, prefix };
}
