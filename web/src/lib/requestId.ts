/**
 * Idempotency keys for purchases (architect-AC14, backlog MUST #245). `crypto.randomUUID` exists only in secure
 * contexts (HTTPS or localhost); over plain `http://<lan-or-tailscale-ip>` it is undefined. Fall back to a v4 UUID
 * from `crypto.getRandomValues` (available everywhere), with the version and variant bits set so it matches the
 * server's UUID regex (shop.ts). This is the ONLY place in web/src that calls `randomUUID(`.
 */
type CryptoLike = { randomUUID?: () => string; getRandomValues<T extends ArrayBufferView>(a: T): T };

export function newRequestId(c: CryptoLike = globalThis.crypto as CryptoLike): string {
  if (typeof c.randomUUID === 'function') {
    try {
      return c.randomUUID();
    } catch {
      /* some browsers throw outside a secure context: fall through */
    }
  }
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // variant 10xx
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
