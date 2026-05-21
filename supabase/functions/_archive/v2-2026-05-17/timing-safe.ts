// Constant-time string comparison. Guards shared-secret webhook auth from
// timing-leak attacks where `a !== b` short-circuits on the first mismatched
// byte and exposes a length / prefix oracle.

export function timingSafeEqual(a: string, b: string): boolean {
  const ae = new TextEncoder().encode(a);
  const be = new TextEncoder().encode(b);
  if (ae.byteLength !== be.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < ae.byteLength; i++) {
    diff |= ae[i] ^ be[i];
  }
  return diff === 0;
}
