// APNs HTTP/2 push delivery. Generates an ES256 JWT signed with the .p8
// private key, then POSTs the payload to api.push.apple.com (production)
// or api.sandbox.push.apple.com (sandbox). Deno's fetch negotiates HTTP/2
// automatically when the server supports it.

const ENC = new TextEncoder();

function b64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cachedKey: { keyId: string; key: CryptoKey } | null = null;

async function loadP8Key(p8Pem: string, keyId: string): Promise<CryptoKey> {
  if (cachedKey && cachedKey.keyId === keyId) return cachedKey.key;
  const der = pemToDer(p8Pem);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der.buffer as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  cachedKey = { keyId, key };
  return key;
}

let cachedJwt: { token: string; issuedAt: number; keyId: string } | null = null;

async function getApnsJwt(): Promise<string> {
  const keyId = Deno.env.get('APNS_KEY_ID')!;
  const teamId = Deno.env.get('APNS_TEAM_ID')!;
  const p8B64 = Deno.env.get('APNS_KEY_P8_B64')!;

  // APNs JWTs are valid for ~60 min; rotate at 50 min to be safe.
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.keyId === keyId && now - cachedJwt.issuedAt < 50 * 60) {
    return cachedJwt.token;
  }

  const p8Pem = atob(p8B64);
  const key = await loadP8Key(p8Pem, keyId);

  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = { iss: teamId, iat: now };
  const headerB64 = b64UrlEncode(ENC.encode(JSON.stringify(header)));
  const payloadB64 = b64UrlEncode(ENC.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      ENC.encode(signingInput),
    ),
  );
  const token = `${signingInput}.${b64UrlEncode(sig)}`;
  cachedJwt = { token, issuedAt: now, keyId };
  return token;
}

export interface ApnsSendArgs {
  deviceToken: string;
  environment: 'ios-sandbox' | 'ios-production';
  title: string;
  body: string;
  data?: Record<string, string>;
  /**
   * App icon badge count. iOS will NOT auto-decrement, so the sender must
   * push the post-delivery total (e.g. unseen + pending requests) and the
   * client clears via setBadgeCountAsync when items are viewed.
   */
  badge?: number;
}

export interface ApnsSendResult {
  ok: boolean;
  status: number;
  reason?: string;
  /** True when APNs reports the token is unrecoverably bad — caller should clear it. */
  unregistered?: boolean;
}

export async function sendApnsPush(args: ApnsSendArgs): Promise<ApnsSendResult> {
  const jwt = await getApnsJwt();
  const bundleId = Deno.env.get('APNS_BUNDLE_ID')!;
  const host = args.environment === 'ios-production'
    ? 'api.push.apple.com'
    : 'api.sandbox.push.apple.com';

  const payload = {
    aps: {
      alert: { title: args.title, body: args.body },
      sound: 'default',
      ...(typeof args.badge === 'number' ? { badge: args.badge } : {}),
    },
    ...(args.data ?? {}),
  };

  const resp = await fetch(`https://${host}/3/device/${args.deviceToken}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (resp.ok) return { ok: true, status: resp.status };

  const text = await resp.text().catch(() => '');
  let reason = text;
  try {
    const j = JSON.parse(text);
    reason = j.reason ?? text;
  } catch { /* not JSON */ }

  // 410 = token has been retired by Apple; 400 BadDeviceToken = malformed.
  const unregistered = resp.status === 410
    || reason === 'BadDeviceToken'
    || reason === 'Unregistered';
  return { ok: false, status: resp.status, reason, unregistered };
}
