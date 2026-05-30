// Provider-agnostic shape every adapter normalizes raw webhook events into.
// The router (../index.ts) holds the dispatch logic; adapters just translate.
//
// Adding a new provider = one new file in ./adapters that exports an Adapter
// satisfying this interface. The router needs zero changes per new provider
// beyond an import + entry in the providers map.

export type WebSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "expired";

/**
 * Normalized internal event. One incoming provider webhook → 0..1 of these
 * (returning null means "no-op event we don't care about", e.g. invoice draft).
 */
export interface NormalizedSubscriptionEvent {
  /** Supabase user UUID. Adapter is responsible for resolving from the
   *  provider's customer_id / passthrough / metadata field. */
  userId: string;
  /** Stable provider sub id used as the upsert key. */
  providerSubscriptionId: string;
  providerCustomerId?: string;
  status: WebSubscriptionStatus;
  currentPeriodEnd?: string;        // ISO 8601
  cancelledAt?: string;             // ISO 8601
  trialEndsAt?: string;             // ISO 8601
  priceAmountCents?: number;
  priceCurrency?: string;
  /** For audit log / replay. Raw provider payload, JSON-serializable. */
  rawEvent: unknown;
  /** Lifecycle email to send after reconcile, if any. */
  emailType?: "subscription_welcome" | "subscription_cancelled" | "subscription_renewal_failed" | "trial_ending_soon";
}

export interface Adapter {
  /** Provider key — stored on web_subscriptions.provider. Used in
   *  profiles.subscription_source = `web_${provider}`. */
  readonly provider: string;

  /**
   * Verify the request authenticity (HMAC, mTLS, IP allowlist, whatever the
   * provider uses). Throws on failure with a short message; router returns
   * 401. Must NOT throw on transient errors — caller wants distinct status.
   */
  verify(req: Request, rawBody: string): Promise<void>;

  /**
   * Parse + normalize. Return null when the event is uninteresting (we
   * still 200 — provider should not retry).
   */
  parse(rawBody: string): Promise<NormalizedSubscriptionEvent | null>;
}
