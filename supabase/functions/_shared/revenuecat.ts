// RevenueCat REST API v2 client.
//
// Used by the webhook handler to read a customer's *current* entitlement state
// straight from RevenueCat rather than trusting the (mutable, event-shaped)
// webhook payload. This makes plan sync correct for every event type —
// including TRANSFER, where the payload carries no app_user_id and the old
// owner's entitlement is silently revoked.
//
// Auth: a v2 Secret API key (`sk_…`). The legacy v1 key is NOT accepted by v2
// endpoints (returns 403 code 7723).

const RC_API_BASE = "https://api.revenuecat.com/v2";

/**
 * Returns true if the customer currently holds any active entitlement.
 *
 * MoaVoca runs a single premium entitlement (2-tier free/premium), so
 * "has any active entitlement" is equivalent to "is premium". We intentionally
 * don't filter by entitlement lookup_key: the v2 active_entitlements item only
 * exposes the internal entitlement id (not the lookup_key) without an extra
 * expand round-trip, and reading the entitlement catalog requires a separate
 * key permission we don't grant the webhook.
 *
 * A 404 means RC has never seen this customer → no entitlement → false.
 * Other non-2xx responses throw so the webhook returns 500 and RC retries.
 */
export async function customerHasActiveEntitlement(
  projectId: string,
  customerId: string,
  apiKey: string,
): Promise<boolean> {
  const res = await fetch(
    `${RC_API_BASE}/projects/${projectId}/customers/${
      encodeURIComponent(customerId)
    }/active_entitlements`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );

  if (res.status === 404) return false;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RC API ${res.status}: ${text}`);
  }

  const data = await res.json() as { items?: unknown[] };
  return Array.isArray(data.items) && data.items.length > 0;
}
