# Incident Response Playbook — MoaVoca / Funston

**Owner:** Junsung Park (박준성, 대표)
**Phone:** +82-10-9966-3457
**Email:** support@moavoca.com
**Last revised:** 2026-05-30

The single-page protocol for handling a confirmed or suspected security incident affecting MoaVoca user data, infrastructure, or service availability. Built around the strictest of the regulatory clocks we are subject to: **PIPA Art. 34 / GDPR Art. 33 — 72-hour notification deadline.**

---

## 0. Activate when any of these fire

- Sentry alert: spike in 5xx errors, unauthorized-access exceptions, repeated auth.uid IS NULL violations
- Supabase audit log: anomalous `service_role` use, mass deletes/updates, policy bypasses
- User report of: account takeover, seeing another user's data, leaked credentials
- External notification: security researcher email, vendor breach disclosure
- Code/secrets leak: `.env`, service_role key, or OAuth secret committed publicly
- Vendor outage with PII impact: Supabase / OpenAI / Azure incident affecting our data

Treat ambiguous reports as confirmed until proven otherwise.

---

## 1. First 60 minutes — Containment

- [ ] Open an incident ticket (private Notion / GitHub issue with sensitive content omitted)
- [ ] Identify affected surface: Supabase project, specific edge function, third-party processor
- [ ] **Rotate suspect credentials immediately:**
  - Supabase: Project Settings → API → roll service_role + anon keys
  - OpenAI / Azure TTS / RevenueCat: rotate API keys at each console
  - Google OAuth client secret if relevant
  - Re-deploy edge functions with new secrets
- [ ] Snapshot evidence before it disappears: Sentry trace IDs, Supabase Logs export, screenshots
- [ ] If active exploitation: temporarily disable sign-ups (Auth → Providers → toggle off Email)
- [ ] If single user compromised: set `auth.users.banned_until = 'infinity'` for that uid

---

## 2. Hours 1–24 — Scoping & assessment

Answer these in writing so the 72h notice has accurate facts:

- [ ] **What data was exposed?** (email, password hash, learning data, payment ID — list fields)
- [ ] **How many users affected?** Query `auth.users` joined with the affected table; document the exact count
- [ ] **Which jurisdictions?** Cross-ref `profiles.country` — split KR / EU / UK / US-California / other
- [ ] **Was it accessed vs. just exposed?** Check Supabase logs for actual read events vs. policy gap
- [ ] **Root cause (preliminary):** SQL injection, leaked secret, RLS bug, vendor compromise, social engineering, other
- [ ] Decide notification obligations:
  - **PIPA (KR):** any breach of personal information → user notice without delay; **separately**, breach of ≥ 1 000 users or sensitive info → KISA / 개인정보보호위원회 within 72 h
  - **GDPR (EU/UK):** any breach posing "risk to rights and freedoms" → lead DPA within 72 h; "high risk" → users without undue delay
  - **CCPA (California):** breach + unencrypted personal info → users in the most expedient time possible

---

## 3. Hours 24–72 — Notification

- [ ] **PIPA submissions** (in Korean):
  - 개인정보침해 신고센터: <https://privacy.kisa.or.kr/main.do> · phone 국번없이 118
  - 개인정보보호위원회: <https://www.pipc.go.kr>
- [ ] **EU lead DPA** (if EU users affected): default Ireland Data Protection Commission until/unless a different EU rep is appointed. Use the cross-border breach form.
- [ ] **UK ICO** (if UK users): <https://ico.org.uk/for-organisations/report-a-breach/>
- [ ] **User notice** — in-app banner + email to affected addresses. Must include: what happened, what data, when, what we're doing, what users should do. (Template in §6 below.)
- [ ] **Apple / Google** (only if app-store distribution affected): App Review contact if a critical bug requires expedited update
- [ ] Optional but recommended: post on moavoca.com (status note) for transparency

---

## 4. Hours 72+ — Remediation & closeout

- [ ] Reconstruct forensic timeline: entry vector → lateral movement → data touched → exit
- [ ] Code/config patch + migration deploy
- [ ] Post-incident review (private): what worked, what didn't, what to change
- [ ] Decide insurance claim filing once cyber policy is in force (currently deferred — see [business risk audit](../../../.claude/projects/-Users-junsung-Desktop-MoaVoca/memory/project_business_risk_audit_2026-05-30.md))
- [ ] Update this playbook if any step proved unclear under real load

---

## 5. Key external contacts

| Purpose | Contact | Notes |
|---|---|---|
| Personal data breach (KR) | KISA Privacy Center · 02-405-5118 · 국번없이 118 | 24/7 hotline |
| PIPC (data protection authority) | <https://www.pipc.go.kr> | Online complaint/notification portal |
| Cyber insurance | Not yet acquired | Planned post-revenue |
| Legal counsel | Not yet retained | First incident → engage 법무법인 spot consult |
| Supabase support | <https://supabase.com/dashboard/support> · Pro priority | Use for vendor-side incidents |
| Forensics | Not retained | Emergency: AhnLab / SK Shieldus public-facing IR services |

---

## 6. User notification template

> Subject: Important security notice from MoaVoca
>
> Hello,
>
> On [DATE], we discovered that [BRIEF FACTUAL DESCRIPTION]. Personal information that may have been involved: [LIST FIELDS]. We have already [ACTIONS TAKEN — rotated keys, patched the issue, etc.].
>
> Based on our investigation so far, [WAS / WAS NOT] accessed by an unauthorized party. We have [REPORTED / WILL REPORT] this to the relevant authorities as required by law.
>
> What you should do: [SPECIFIC ACTIONS — change password, watch for phishing, etc.].
>
> We are deeply sorry. If you have questions, reach us at security@moavoca.com.
>
> — Funston (MoaVoca)

---

## 7. Annual drill

Pick one fictional scenario each Q1 (e.g., "service_role key leaked via GitHub commit"). Walk through §1–§3 in 60 minutes against this document. Update anything that didn't make sense.

Logged drills (date + scenario + notes):

- *None yet — first drill due Q1 2027*
