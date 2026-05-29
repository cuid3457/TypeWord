// FCM HTTP v1 push delivery. Exchanges a service-account JWT for an OAuth2
// access token, then POSTs the message to /v1/projects/<project>/messages:send.
// Access tokens are cached in module scope (~1 h validity) so warm function
// invocations skip the round trip.

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

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri: string;
}

let cachedAccount: ServiceAccount | null = null;
function getServiceAccount(): ServiceAccount {
  if (cachedAccount) return cachedAccount;
  const b64 = Deno.env.get('FCM_SERVICE_ACCOUNT_B64')!;
  const json = atob(b64);
  cachedAccount = JSON.parse(json) as ServiceAccount;
  return cachedAccount;
}

let cachedSigningKey: CryptoKey | null = null;
async function getSigningKey(privateKeyPem: string): Promise<CryptoKey> {
  if (cachedSigningKey) return cachedSigningKey;
  const der = pemToDer(privateKeyPem);
  cachedSigningKey = await crypto.subtle.importKey(
    'pkcs8',
    der.buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return cachedSigningKey;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  // Refresh 60 s before expiry so we don't race a near-expired token.
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.token;

  const acct = getServiceAccount();
  const key = await getSigningKey(acct.private_key);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: acct.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: acct.token_uri,
    exp: now + 3600,
    iat: now,
  };
  const headerB64 = b64UrlEncode(ENC.encode(JSON.stringify(header)));
  const payloadB64 = b64UrlEncode(ENC.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      ENC.encode(signingInput),
    ),
  );
  const assertion = `${signingInput}.${b64UrlEncode(sig)}`;

  const resp = await fetch(acct.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  if (!resp.ok) {
    throw new Error(`fcm oauth failed: ${resp.status} ${await resp.text()}`);
  }
  const json = await resp.json() as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expiresAt: now + json.expires_in };
  return cachedToken.token;
}

export interface FcmSendArgs {
  fcmToken: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Notification channel id for Android 8+ — must match a channel created by the app. */
  channelId?: string;
  /**
   * Launcher badge count (Samsung/Pixel etc.). Mirrors APNs aps.badge — the
   * sender pushes the absolute post-delivery total. Without this the
   * launcher dot doesn't increment past the first push.
   */
  badge?: number;
  /**
   * Notification tag — Android replaces any existing notification sharing
   * the same tag. Samsung One UI stops respecting notification_count once
   * multiple distinct notifications stack from the same app, so collapsing
   * repeated pokes from one sender under a single tag is what actually
   * makes the launcher badge track the latest count.
   */
  tag?: string;
}

export interface FcmSendResult {
  ok: boolean;
  status: number;
  reason?: string;
  unregistered?: boolean;
}

export async function sendFcmPush(args: FcmSendArgs): Promise<FcmSendResult> {
  const token = await getAccessToken();
  const acct = getServiceAccount();

  // OS-displayed notification + data sidecar. We attempted data-only with a
  // headless TaskManager task to drive Samsung's launcher badge precisely,
  // but expo-notifications' Android background task did not fire reliably
  // (tested on Galaxy / One UI). Accepting the limitation: notifications
  // always appear; the launcher badge syncs the next time the user focuses
  // the app (setBadgeCountAsync from `refreshNotificationBadge`).
  const message = {
    token: args.fcmToken,
    notification: { title: args.title, body: args.body },
    ...(args.data ? { data: args.data } : {}),
    android: {
      priority: 'HIGH' as const,
      notification: {
        sound: 'default',
        ...(args.channelId ? { channel_id: args.channelId } : {}),
        ...(typeof args.badge === 'number' ? { notification_count: args.badge } : {}),
        ...(args.tag ? { tag: args.tag } : {}),
      },
    },
  };

  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${acct.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message }),
    },
  );

  if (resp.ok) return { ok: true, status: resp.status };

  const text = await resp.text().catch(() => '');
  let reason = text;
  try {
    const j = JSON.parse(text);
    reason = j?.error?.status ?? j?.error?.message ?? text;
  } catch { /* not JSON */ }

  // UNREGISTERED / INVALID_ARGUMENT (with bad token) → clear from DB.
  const unregistered = resp.status === 404
    || reason === 'UNREGISTERED'
    || /not.*registered|invalid.*registration/i.test(reason);
  return { ok: false, status: resp.status, reason, unregistered };
}
