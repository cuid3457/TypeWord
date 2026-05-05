/**
 * Minimum age of digital consent by country, used for the onboarding
 * self-attestation line. Self-attestation alone does not constitute
 * verifiable parental consent — it's the standard mobile-app practice that
 * the listed age represents the user's claim about themselves. Default: 13
 * (USA/COPPA, UK, JP, AU, CA, BR, MX, and several EU member states).
 */

const COUNTRY_MIN_AGE: Record<string, number> = {
  // ── Age 14 ────────────────────────────────────────────────────────────
  KR: 14, // 정보통신망법
  CN: 14, // PIPL
  RU: 14, // 152-FZ Personal Data Law
  // EU 14: Italy, Spain, Austria, Bulgaria, Cyprus, Lithuania (GDPR Art. 8)
  AT: 14, BG: 14, CY: 14, IT: 14, LT: 14, ES: 14,

  // ── Age 15 ────────────────────────────────────────────────────────────
  // EU: France, Czechia, Greece, Slovenia
  CZ: 15, FR: 15, GR: 15, SI: 15,

  // ── Age 16 ────────────────────────────────────────────────────────────
  // EU 16 (strictest GDPR Art. 8): Germany, Netherlands, Ireland,
  // Luxembourg, Slovakia, Hungary, Romania, Croatia, Poland.
  // EEA: Liechtenstein. Plus Switzerland (revFADP).
  CH: 16, DE: 16, HR: 16, HU: 16, IE: 16, LI: 16, LU: 16,
  NL: 16, PL: 16, RO: 16, SK: 16,

  // ── Age 18 ────────────────────────────────────────────────────────────
  // Jurisdictions where data-protection law requires parental consent for
  // under-18s. Self-attestation of 18+ is the standard compliance posture
  // for general mobile apps in these markets.
  IN: 18, // DPDP Act 2023 — "child" = under 18
  MY: 18, // PDPA + Civil Code
  SA: 18, // PDPL
  TR: 18, // KVKK + Civil Code
  ZA: 18, // POPIA §35

  // ── Age 20 ────────────────────────────────────────────────────────────
  TH: 20, // Thailand PDPA — uses civil-code age of majority

  // ── Age 13 (default) ──────────────────────────────────────────────────
  // US, UK, JP, AU, NZ, CA, BR, MX, BE, DK, EE, FI, LV, MT, PT, SE, NO,
  // IS, ID, VN, SG, TW, HK, PH, AR, CL, etc. — all fall through.
};

const FALLBACK_AGE = 13;

export function getMinimumAge(countryCode: string | undefined | null): number {
  if (!countryCode) return FALLBACK_AGE;
  return COUNTRY_MIN_AGE[countryCode.toUpperCase()] ?? FALLBACK_AGE;
}
