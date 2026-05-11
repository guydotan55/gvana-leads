# Wasender Integration Primer

> Compiled May 11 2026 for the Leads Control Center pilot. Sources: official
> docs, vendor blog, npm/PyPI SDKs, third-party ban-risk analyses. Every
> nontrivial claim is cited in **Sources**. **DATED** = older than 12 months;
> **UNVERIFIED** = could not confirm.

## Executive Summary

1. **Wasender is an unofficial WhatsApp gateway** — it automates a WhatsApp Web
   session linked to a real phone number via QR code. It is **not** a Meta
   Business Solution Provider and does **not** sit on the WhatsApp Cloud API. [1][13]
2. **Pricing is per-session, not per-message.** Plans start at $6/mo for one
   number and scale to $45/mo for ten. No template fees, no marketing/utility
   conversation charges. That is the whole reason to consider it over Infobip. [2]
3. **Ban risk is real and material.** Independent analyses report 2–8 week
   account lifespans for protocol-level WhatsApp Web automation when used
   carelessly, with permanent number bans as a frequent outcome. Wasender's own
   compliance docs recommend ≤2 msgs/minute, ≤6 hours/day, ≤3 consecutive days
   on a fresh number. [3][12]
4. **API surface is REST + JSON, Bearer auth, with webhooks for inbound and
   session status.** Webhook "signing" is a static shared-secret string compare,
   not HMAC — weaker than Infobip/Stripe-grade. [4][7][8]
5. **Recommendation for the pilot:** wire Wasender behind the existing provider
   abstraction, gate on `client.config.ts`, and bake in pacing + warm-up + a
   session-down kill switch from day one. Do not migrate Mechinat Gvana until
   Client 2 has used it for ~30 days without a ban event.

---

## 1. API Surface — Outbound Messaging

**Base URL:** `https://www.wasenderapi.com/api` (inferred from docs/SDK). [4][5]

**Auth:** `Authorization: Bearer <API_KEY>`. Two key types exist — a *Personal
Access Token* (account-level, from settings) and a per-session *API key*
generated after the QR scan. For outbound messaging you typically use the
session API key. [4][7]

**Primary endpoint:** `POST /api/send-message`. One endpoint handles text,
image, video, audio, document, sticker, contact, location, poll, quoted reply,
and view-once. Recipient is identified by phone (E.164, digits only — no `+`)
or by group/channel JID. [4]

Other endpoints we'll care about for v1:

| Endpoint | Method | Why we need it |
|----------|--------|----------------|
| `/api/whatsapp-sessions` | GET | List sessions (per-client config sanity check) |
| `/api/whatsapp-sessions/{id}/qrcode` | GET | Pull QR for initial linking — wire into an admin screen later |
| `/api/whatsapp-sessions/{id}/connect` | POST | Re-establish after disconnect |
| `/api/whatsapp-sessions/{id}/restart` | POST | Hard reset when a session goes flaky |
| `/api/status` | GET | Liveness probe for the integration |
| `/api/on-whatsapp/{phone}` | GET | Verify recipient before sending (saves a wasted send + a CAPI miss) |
| `/api/messages/{id}/info` | GET | Delivery status fallback when webhooks miss |

[4]

**Send response shape** (from the Python SDK): `WasenderSendResult` wrapping
`{ response.data.message_id, status }`. Store whatever they return alongside
the row in the Sheet. [5]

**SDKs:** official Node.js (`wasenderapi` on npm), Python (PyPI, v0.3.5, Nov 30
2025), Laravel, and an n8n community node. Use the **Node SDK** in API routes,
wrapped in our own thin client so we can swap providers without bleeding
Wasender types through the codebase. [5][6]

---

## 2. Session / QR Lifecycle

Wasender's model is essentially "headless WhatsApp Web in their datacenter":

1. Create a session via dashboard or `POST /api/whatsapp-sessions`.
2. Fetch the QR via `GET /api/whatsapp-sessions/{id}/qrcode`.
3. Human scans QR from the phone's *Settings → Linked Devices*.
4. Session enters `connected` state and a session-scoped API key is exposed.
5. Wasender claims auto-reconnect and "auto-repair browser issues" on their
   side. [7][9]

**QR TTL:** generated QR URLs expire after 1 hour. [4]

**Disconnect signals to handle:** phone offline >14 days (WhatsApp's standard
Linked Devices unlink rule — **UNVERIFIED** in Wasender's docs), manual unlink
from the phone, ban of the underlying number (§4), Wasender infra blips (§5).

**Detection paths:** webhook `session.status` / `session_status` (naming
inconsistency between docs pages — confirm during integration) [4][8];
poll `GET /api/status` for liveness or `GET /api/whatsapp-sessions/{id}` for
specific state [4]; send-time error `Session is not Connected` (exact HTTP code
not documented) [10].

**Code implication:** every `sendMessage` needs a typed `SESSION_DOWN` path
that surfaces to admin UI as "WhatsApp לא מחובר — לסרוק QR מחדש" and disables
outbound until reconnected. Fail loud per project rules — silent drops here =
a lead never gets contacted.

---

## 3. Rate Limits & Quotas

Published values, per Wasender's rate-limits page: [11]

| Endpoint category | Trial | Paid (Basic → Business) | With "Account Protection" on |
|-------------------|-------|-------------------------|------------------------------|
| Send message | 1 req/min, 50/day | 256 req/min | **1 req / 5 seconds** (overrides plan) |
| Group participants/metadata | — | 10 req/min, 500/day | same |
| Get contact picture | — | 60 req/min, 1,000/day | same |
| `on-whatsapp` check | — | 60 req/min, 1,000/day | same |

**Account Protection** is a toggle Wasender exposes that throttles aggressively
to keep your number from getting banned. Wasender themselves recommend it for
production — turn it on and budget around 12 messages/minute, not 256. [11]

**Response headers** on every call:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset` (seconds until window resets)

**429 body:** `{"message": "...", "retry_after": <seconds>}`. The Node SDK has
optional retry-on-429 (`enabled, maxRetries`) — but blindly retrying on a
WhatsApp Web backend is dangerous, see §4. [5][6][11]

**Critical caveat from Wasender's own docs:** *"A global concurrent request
limit applies per session across all endpoints to prevent WhatsApp bans, even
when minute limits are respected. Distributing requests evenly rather than
sending concurrently is strongly recommended."* [11]

Translation: even within the published 256/min, sending in concurrent bursts
will get you banned. Our send loop must be serial-per-session with jitter.

---

## 4. Ban / Block Risk — The Real One

WhatsApp's ToS forbid third-party automation of WhatsApp Web. Meta actively
detects unofficial clients through three layers, per a recent independent
analysis (Apr 9 2026): [12]

1. **Protocol fingerprinting** — the WhatsApp Web handshake from libraries like
   Baileys is distinguishable from the real client.
2. **Behavioral analysis** — message velocity, missing typing indicators,
   instant read receipts, 24/7 session activity, identical message bodies.
3. **User reports** — block rate over 5% triggers action regardless of the
   tool used.

The same source cites typical lifespans for protocol-level tooling: **Baileys
2–8 weeks, Evolution API "weeks to months", WA-Automate 1–3 months.** Wasender
does not disclose its underlying library; based on its feature set (groups,
channels, polls, reactions, view-once) it is almost certainly Baileys or a
close cousin — meaning it inherits the same fingerprint risk. **UNVERIFIED** —
Wasender will not confirm this publicly. [12]

### What Wasender themselves recommend

Compliance page: ≤2 msgs/min, ≤6 hrs/day, ≤3 consecutive days on a fresh
number; ≥1 day after registration before linking; personalize bodies, no
identical content at scale, no links in the first message, HTTPS only; aim for
≥30% reply rate per 100 sent; include "Reply STOP" opt-out; complete profile
picture + description. [3]

Anti-ban blog: **Week 1** manual-only with balanced send/receive ratio;
**Week 2** automated sends to engaged users, 10–20/day; **Week 3** +20% every
few days. Delays: **15–45 s jitter** between messages, **10–15 min rest after
every 50** messages. [13]

### Implications for the dashboard

NGO lead workflows are mostly inbound-reply driven, low daily volume — risk is
**moderate, not catastrophic**. But:

1. Pacing must be enforced **in code**, not by operator discipline. 15–45 s
   jitter between sends, hard cap ~120 outbound/day per number for v1.
2. Warm-up matters for Client 2 — a brand-new number needs a 1–3 week ramp
   before pointing all FB Lead Ad replies at it.
3. A spare number per client is sane insurance. Cheap on Wasender — Pro plan
   = 3 sessions for $15/mo.
4. Never reuse identical message bodies. Even existing Infobip templates should
   be wrapped in light personalization (name, lead source) before send.

---

## 5. Reliability

- **Status page:** `wasenderapi.com/status` is linked in the help footer.
  **UNVERIFIED** whether it's a real live monitor or a vanity page. [9]
- **Third-party monitor:** SaaSHub unofficial tracker — "no incidents in last
  24h" at research time, no historical depth. [14]
- **Published SLA:** none found. [9]
- **Self-reported:** "high uptime, fast delivery, global infrastructure" —
  discount accordingly. [1][9]
- **User reviews:** G2 + Trustpilot mostly positive on delivery speed;
  negatives cluster on (a) banned numbers and (b) session drops requiring
  re-scan. Trustpilot returned 403 to our fetch (bot block), so we could not
  independently sample. [15]

**Our position:** treat as best-effort. The Sheet stays source of truth, every
send logs status, and if status goes red >5 minutes the dashboard surfaces a
banner.

---

## 6. Pricing — vs Infobip

Wasender tiers (May 2026): [2]

| Plan | $/mo | Sessions | Per-session $ |
|------|------|----------|---------------|
| Basic | $6 | 1 | $6.00 |
| Pro | $15 | 3 | $5.00 |
| Plus | $30 | 6 | $5.00 |
| Business | $45 | 10 | $4.50 |

All tiers: unlimited messages, all message types, webhooks, MCP support,
priority support. The only axis is session count. [2]

**Effective cost vs Infobip:** Infobip charges Meta's per-message rates plus
BSP markup. Meta's July 2025 US rates (Israel similar for marketing, lower for
utility): marketing $0.025, utility $0.004, authentication $0.0135. BSPs
typically add 10–30%. [16][17]

For 1,000 outbound marketing msgs/mo: Infobip roughly **$25–$40** in Meta fees
+ BSP overhead. Wasender: **$6 flat.** For 5,000/mo: Infobip ≥$125 vs Wasender
$6–$15. The economics are why we're doing this.

**Caveat:** the saving evaporates the moment a number is banned and the NGO
loses its WhatsApp identity. The hidden cost is operational risk, not line
item.

---

## 7. Production-Grade Patterns

### Idempotency

**Wasender does not document an `Idempotency-Key` header.** Stripe-style
client-side idempotency is not supported. [4] Workaround: idempotency in the
Sheet — before calling `send-message`, check `lead.last_send.message_id`
freshness; the queue worker claims a row (`sending` status) before the API
call so a duplicate worker can't double-send.

### Webhook signatures

**Weak.** Wasender's verification is a static string compare against the
`X-Webhook-Signature` header — not HMAC, no timestamp, no replay protection. [8]
Mitigations: long random secret in env, `crypto.timingSafeEqual` for the
compare, and **v1 is outbound-only** so inbound webhooks are deferred. Until
then, poll `messages/{id}/info` after send for status.

### Error taxonomy

Documented categories: Validation, Authentication, No Active Subscription,
Trial Bulk Limit, Rate Limit (Trial + Account Protection flavors, both
429-shaped), **Session is not Connected** (the one we'll see most). Specific
HTTP status codes per error are *not* enumerated — infer from headers and the
`message` field. [10]

Our mapping:
- `401`/auth → "API key invalid — check `.env.local`"
- `403`/no subscription → "Plan expired"
- `429` → respect `retry_after`, queue and back off (no blind retry)
- `"Session is not Connected"` → set client flag, surface to admin UI
- everything else → log + alert, keep row in `pending`

### Retry / backoff

Node SDK has `RetryConfig { enabled, maxRetries }` for 429 only. [6]
**Disable SDK auto-retry** and own retries at the queue level: WhatsApp Web
bans are velocity-based — auto-retry under load is the worst thing you can do.
Sheet is source of truth; queue retries on its own schedule (e.g., 60 s → 5 m
→ 30 m), writing a row update each time.

---

## 8. Brief Comparison — Wasender vs Alternatives

| Provider | Model | Entry price | Per-msg fee | Ban risk |
|----------|-------|-------------|-------------|----------|
| **Wasender** | WhatsApp Web (unofficial) | $6/mo / session | none | High (inherent to model) [12] |
| **Whapi Cloud** | WhatsApp Web (unofficial) | higher | none | Same protocol-level risk [18] |
| **Green API** | WhatsApp Web (unofficial) | $12/mo | none | Same protocol-level risk [19] |
| **Twilio for WhatsApp** | Official Cloud API (BSP) | $0 platform + Meta rates | per-conversation Meta rates | Negligible |
| **Infobip** (current) | Official Cloud API (BSP) | subscription + Meta rates | per-conversation Meta rates | Negligible |

**Wasender's positioning** within the unofficial tier: cheapest entry point,
unlimited messaging, decent docs, official SDKs. The trade-off vs Whapi is
similar protocol risk for ~half the price; vs Green API similar story plus
multi-session is unlimited rather than gated. [18][19]

**Bottom line:** if you've already decided to live with WhatsApp Web automation,
Wasender is a sane pick. If ban tolerance is zero, none of the unofficial tier
is acceptable and you stay on Infobip.

---

## Risks & Open Questions

1. **Underlying library — Baileys or proprietary?** Not disclosed. Material
   because Baileys-based stacks are detected fastest. Worth asking support
   directly before pilot. **UNVERIFIED.** [12]
2. **What does "Account Protection" actually do?** Docs say it throttles to
   1 req / 5 s. Confirm whether it also adds typing-indicator simulation,
   read-receipt delay, etc. **UNVERIFIED.** [11]
3. **How does Wasender behave when WhatsApp force-unlinks the device after
   14 days of phone offline?** Need to test by parking a session and seeing
   what the webhook + status endpoint report. **UNVERIFIED.**
4. **Webhook signature is a static compare, not HMAC.** Acceptable for v1
   (outbound only) but must be flagged before we wire inbound. [8]
5. **No idempotency header.** Our queue must own dedupe. [4]
6. **No SLA.** Pilot is in production but with light volume — acceptable for
   Gvana, must communicate to Client 2 in their onboarding. [9]
7. **Israel-specific behavior.** No reports found on Israeli numbers and
   Wasender — phone normalization via `lib/phone.ts` should be sufficient since
   Wasender accepts plain E.164 digits, but worth a smoke test before pointing
   real Gvana leads at it. **UNVERIFIED for our specific case.**
8. **`session_status` vs `session.status` event naming inconsistency** between
   the docs main page and the webhook setup page. Verify the exact event name
   the receiver actually fires during integration. [4][8]
9. **Trustpilot returned 403 to our fetch** — we could not independently
   sample negative reviews. Worth a manual check before committing the pilot. [15]

---

## Sources

1. Wasender — [home page / pricing & feature claims](https://wasenderapi.com/)
2. Wasender — [pricing tiers (Basic/Pro/Plus/Business)](https://wasenderapi.com/) (rendered May 2026)
3. Wasender — [Key Compliance Points to Avoid Account Flagging or Blocking](https://wasenderapi.com/help/messaging/key-compliance-points-avoid-account-flagging-blocking)
4. Wasender — [API documentation index](https://wasenderapi.com/api-docs)
5. PyPI — [`wasenderapi` Python SDK, v0.3.5, published Nov 30 2025](https://pypi.org/project/wasenderapi/)
6. npm — [`wasenderapi` Node.js SDK](https://www.npmjs.com/package/wasenderapi)
7. Wasender — [Getting Started with WasenderAPI](https://wasenderapi.com/api-docs/getting-started/getting-started-with-wasenderapi)
8. Wasender — [Webhook Setup (X-Webhook-Signature, event list)](https://wasenderapi.com/api-docs/webhooks/webhook-setup)
9. Wasender — [Help Center (status page + footer)](https://wasenderapi.com/help)
10. Wasender — [Error Responses reference](https://wasenderapi.com/api-docs/responses-errors/error-responses)
11. Wasender — [Understanding Rate Limits](https://wasenderapi.com/api-docs/rate-limits/understanding-rate-limits)
12. Kraya AI (Apr 9 2026) — [WhatsApp Automation Ban Risk: Safe vs Unsafe Tools (2026)](https://blog.kraya-ai.com/whatsapp-automation-ban-risk)
13. Wasender — [Stop Getting Banned: Anti-Ban Strategy for Unofficial APIs (2025)](https://wasenderapi.com/blog/stop-getting-banned-the-ultimate-whatsapp-anti-ban-strategy-for-unofficial-apis-in-2025) — DATED (2025, still consistent with current compliance page)
14. SaaSHub — [WasenderApi unofficial status tracker](https://www.saashub.com/wasenderapi-status)
15. Trustpilot — [WasenderApi reviews (page returned 403, not independently verified)](https://www.trustpilot.com/review/wasenderapi.com)
16. EngageLab — [WhatsApp Business API Pricing: 2026 Complete Cost Guide](https://www.engagelab.com/blog/whatsapp-business-api-pricing)
17. Chatarmin — [WhatsApp API Pricing 2026: Costs, Categories & Cost Hacks](https://chatarmin.com/en/blog/whats-app-api-pricing)
18. Wasender — [Best Whapi Cloud Alternative for Developers (2026)](https://wasenderapi.com/blog/best-whapi-cloud-alternative-for-developers-cheaper-whatsapp-api-in-2026) (vendor-biased — used for pricing data point only)
19. Wasender — [Best Green API Alternative for WhatsApp API Developers](https://wasenderapi.com/blog/best-green-api-alternative-for-whatsapp-api-developers-unlimited-messaging) (vendor-biased — used for pricing data point only)
