# Wasender Integration — Design Spec

**Date:** 2026-05-11
**Branch / worktree:** `feat/wasender-integration` @ `worktrees/nihul-leadim/feat-wasender_05-2026`
**Scope:** v1 — outbound text/template sending only. No inbound webhooks, no media.
**Sources:** `docs/superpowers/research/{wasender-primer,multi-provider-architecture,orchestration-playbook}.md`

---

## TL;DR

Add Wasender as a second WhatsApp provider behind a tiny `WhatsAppProvider` interface. Pick per-client via `client.config.ts`. Mechinat Gvana stays on Infobip — zero behavior change. Client 2 onboards on Wasender to validate cost + template-free sending before any migration.

Two real risks beyond the obvious refactor:

1. **Ban risk** — Wasender is unofficial WhatsApp Web automation. Pacing (15–45 s jitter, hard daily cap) must be enforced in code, not by operator discipline.
2. **Template semantics differ** — Infobip ships Meta-approved templates with placeholders. Wasender sends free-form text. We preserve the "admin picks a template" UX by storing the message body in a local per-client registry and letting the Wasender provider render `{{1}}`, `{{2}}` → placeholder values itself.

---

## 1. What Changes, At A Glance

```
lib/
  whatsapp/                       ← NEW
    index.ts                      ← getWhatsAppProvider() factory
    types.ts                      ← WhatsAppProvider, errors, params
    pacing.ts                     ← jitter + per-session daily counter (Wasender only)
    providers/
      infobip.ts                  ← moved from lib/infobip.ts
      wasender.ts                 ← NEW
  infobip.ts                      ← DELETED same PR (3 imports to update)

config/
  wasender-templates.<slug>.json  ← NEW per client using Wasender (local template registry)

client.config.ts                  ← + integrations.whatsapp.provider
.env.local                        ← + WASENDER_API_KEY, WASENDER_BASE_URL, WASENDER_SESSION_ID
```

Three call sites change imports (`app/api/messages/send/route.ts:46`, `app/api/cron/triggers/route.ts:51`, `app/api/templates/sync/route.ts:8`). `lib/capi.ts`, `lib/phone.ts`, `lib/triggers.ts` untouched.

---

## 2. Provider Interface

```ts
// lib/whatsapp/types.ts
export type ProviderName = "infobip" | "wasender";

export interface SendTemplateParams {
  to: string;                  // raw phone; provider normalizes via lib/phone.ts
  templateName: string;        // for Infobip = Meta template; for Wasender = key into local registry
  language: string;            // "he" today
  placeholders: string[];      // ordered, fills {{1}}, {{2}}, ...
  sender?: string;             // per-trigger override; optional
}

export interface SendTemplateResult {
  messageId: string;           // provider's id, round-trips into Sheet
  status: string;              // provider-specific text OK
}

export interface WhatsAppTemplate {
  name: string;
  language: string;
  status: string;              // "APPROVED" for Infobip; "LOCAL" for Wasender
  category: string;            // "MARKETING" | "UTILITY" | "LOCAL" for Wasender
  structure: {
    header?: { format: string };
    body: { text: string; examples?: string[] };
    footer?: { text: string };
    buttons?: Array<{ type: string; text: string }>;
  };
}

export interface WhatsAppProvider {
  readonly name: ProviderName;
  sendTemplateMessage(params: SendTemplateParams): Promise<SendTemplateResult>;
  getTemplates(): Promise<WhatsAppTemplate[]>;
}

export class WhatsAppSendError extends Error {
  constructor(
    public readonly provider: ProviderName,
    public readonly kind:
      | "config"        // missing env, malformed registry
      | "auth"          // 401/403
      | "rate_limit"    // 429
      | "session_down"  // Wasender: WhatsApp Web session unlinked
      | "bad_request"   // 400 — template not found, bad phone
      | "upstream",     // 5xx, network, unknown
    message: string,
    public readonly status?: number,
    public readonly upstreamBody?: string,
  ) {
    super(`[${provider}/${kind}] ${message}`);
    this.name = "WhatsAppSendError";
  }
}
```

No `sendFreeText` in v1 — both call sites use templates. Adds when a real need appears.

---

## 3. Config Schema Changes

```ts
// client.config.ts (additions)
integrations: {
  whatsapp: {
    provider: "infobip" | "wasender";
    batchSize?: number;          // leads processed per cron tick. Default 8. Wasender only.
    dailyCap?: number;           // Wasender only. Default 60 (warm-up); raise after 3 weeks clean.
  };
  infobip: { enabled: boolean };   // kept for v1, prunable later
  capi: { enabled: boolean };
  sheets: { enabled: boolean };
};

// Mechinat Gvana — unchanged behavior:
integrations: {
  whatsapp: { provider: "infobip" },   // batchSize/dailyCap ignored for Infobip
  infobip: { enabled: true },
  capi: { enabled: true },
  sheets: { enabled: true },
},
```

Provider envs:

| Var | Provider | Purpose |
|---|---|---|
| `INFOBIP_API_KEY`, `INFOBIP_BASE_URL`, `INFOBIP_SENDER` | infobip | existing |
| `WASENDER_API_KEY` | wasender | session-scoped Bearer token |
| `WASENDER_BASE_URL` | wasender | default `https://www.wasenderapi.com/api` |
| `WASENDER_SESSION_ID` | wasender | which session to send through |

Each provider's `getConfig()` throws loudly on first call if any of its envs are missing. No `if (slug === ...)` anywhere.

---

## 4. Wasender Template Registry

Wasender has no Meta-template concept. We preserve the dashboard's "pick a template" UX by storing message bodies locally per client:

```json
// config/wasender-templates.<slug>.json
{
  "first_contact_he": {
    "language": "he",
    "category": "LOCAL",
    "body": "שלום {{1}}, פנית אלינו דרך {{2}}. נשמח לחזור אליך — מתי נוח?",
    "buttons": []
  },
  "interview_invite_he": {
    "language": "he",
    "category": "LOCAL",
    "body": "{{1}}, נשמח לזמן אותך לראיון ב-{{2}}. מאשרים?",
    "buttons": []
  }
}
```

- `getTemplates()` on the Wasender provider loads this file, returns it in `WhatsAppTemplate` shape with `status: "LOCAL"`.
- `sendTemplateMessage()` looks up by `templateName`, substitutes `{{1}}`, `{{2}}` → `placeholders[0]`, `placeholders[1]`, fires `POST /api/send-message` with the rendered body.
- Hebrew copy must go through the `hebrew-content-writer` skill when an implementer touches it. Implementer prompts will say so explicitly.

Loud-failure cases the provider must throw on:
- Registry file missing → `config`
- `templateName` not in registry → `bad_request`
- Placeholder count mismatch (template has 3 `{{N}}`, caller passed 2) → `bad_request`

---

## 5. Pacing & Ban Protection (Wasender only)

`lib/whatsapp/pacing.ts` enforces:

| Rule | Value | Why |
|---|---|---|
| Jitter between sends | random 15–45 s | Wasender's own anti-ban guide |
| Hard daily cap | configurable per client; **default 60/day during warm-up** | Tight ceiling for the first ~3 weeks of a new number; raise to 120 after Client 2 has run clean. |
| Rest after N sends | 10 min after every 50 | Wasender guide |
| Concurrency | strictly 1 send in flight per session | Wasender's "global per-session concurrent limit" |

Implementation:

- **Tick strategy: N-per-tick, N=8.** Each cron tick processes up to 8 pending leads, with 15–45 s jitter between each send (≈4 min worst case per tick), then exits. Remaining pending leads are picked up on the next tick. `N` lives in `client.config.ts` (`integrations.whatsapp.batchSize` defaulting to 8) so we can tune per client without code changes. Safe under Vercel's 300 s function timeout.
- **Jitter + concurrency** are owned by `lib/whatsapp/pacing.ts` — random 15–45 s between sends, in-process lock so only one send is in flight per `WASENDER_SESSION_ID`.
- **Daily cap** is read from Sheets each tick (count of today's `sent_at` rows for this client / session). Survives Vercel cold starts cleanly.
- **Per-session concurrency** is an in-process lock — only one send-in-flight per `WASENDER_SESSION_ID` at a time. Vercel serverless reuses warm instances enough that this is good enough for a single-Vercel-project deployment; multi-instance bursts under load are not a v1 concern at NGO volume.

If a tick would breach the daily cap, the provider throws `WhatsAppSendError(kind: "rate_limit", status: 429)` with a clear message; the cron loop logs it and moves on. Lead stays pending → next tick reconsiders tomorrow.

**Note:** Pacing only kicks in for Wasender. Infobip uses Meta's official channel — no ban risk, no rate concern at our volume.

---

## 6. Error Handling — Unified Table

Every provider throws `WhatsAppSendError`. Route handlers wrap in `try/catch`, log full error with `console.error`, return HTTP 500 with a safe message. Cron route per-lead `try/catch` (`app/api/cron/triggers/route.ts:80-86`) shape preserved — one bad lead does not poison the batch.

| Failure | `kind` | Provider raises when | Caller response |
|---|---|---|---|
| Missing env / bad registry | `config` | first call into `getConfig()` | 500 + log; deploy is misconfigured |
| 401/403 from upstream | `auth` | response status 401/403 | 500 + log; rotate key |
| 429 / pacing breach | `rate_limit` | upstream 429 OR pacing module blocks | 500 + log; next tick retries |
| Wasender session unlinked | `session_down` | upstream "Session is not Connected" OR `/api/status` not green | 500 + log; admin must re-scan QR |
| 400 bad payload, missing template | `bad_request` | mapping/phone/template error | 500 + log; data is wrong |
| 5xx / network / unknown | `upstream` | everything else | 500 + log; transient |

**Retries:** none in v1. The cron's natural re-tick is the retry mechanism. We only write the Sheet row on send success, so unsent leads get picked up next tick automatically. No queue, no exponential-backoff library.

**Idempotency:** Sheet-write-after-success is the existing posture; Wasender does not provide an `Idempotency-Key` header. If we crash between send-success and Sheet-write, a duplicate send is *possible* on the next tick — same risk Infobip has today. Accept per "pick simple over clever"; revisit if observed.

**No empty catches.** Per `CLAUDE.md`: every catch logs full context or re-throws.

---

## 7. CAPI Stays Provider-Agnostic

`lib/capi.ts:38-90` does not reference Infobip. It fires `event_name` ("Lead", or `trigger.capi_event`) with hashed phone. The factory pattern preserves this: CAPI still fires after `await wa.sendTemplateMessage(...)` returns. No change to `lib/capi.ts`.

The existing split between `capi.ts` hashing raw `lead.phone` and the provider normalizing via `lib/phone.ts` is unchanged. If we ever align CAPI to the normalized form, it's a one-line change in `capi.ts`, not per-provider.

---

## 8. Testing

**Unit tests** (Jest, only for code we change — per CLAUDE.md):
- `getWhatsAppProvider()` returns infobip / wasender / throws on unknown
- Wasender provider: registry-miss → `bad_request`, placeholder-count mismatch → `bad_request`, missing env → `config`
- Pacing module: respects jitter, daily-cap math, concurrency lock
- Route handler: provider throws → 500, Sheet not mutated, CAPI not fired
- Fake provider helper at `__tests__/helpers/fakeProvider.ts` for everything else

**Manual smoke (G6, mandatory before merge):**
1. Vercel preview deploy with `provider: "infobip"` → send test lead, full flow works (no regression).
2. Flip preview's `client.config.ts` to `"wasender"`, set `WASENDER_*` envs, repeat. Confirm WhatsApp arrives, Sheet stores Wasender `messageId`, CAPI "Lead" appears in Facebook Events Manager test view.
3. Force `session_down` by unlinking the phone — confirm error path surfaces correctly, no silent drops.

---

## 9. Migration

Live Mechinat Gvana: **zero behavior change.** Default config keeps `provider: "infobip"`, same envs, same payload, same `messageId` round-trip, same CAPI events.

New client onboards on Wasender:
1. Set `integrations.whatsapp.provider: "wasender"` in their `client.config.ts`.
2. Add `WASENDER_*` envs in their Vercel project.
3. Add `config/wasender-templates.<slug>.json` with Hebrew copy (vetted via `hebrew-content-writer`).
4. Wasender-side: link the WhatsApp number via QR (manual one-time setup; admin UI for re-linking is v2 scope).
5. Warm-up: ≤2 msgs/min, ≤6 hrs/day, ≤3 consecutive days for week 1. Operator-driven; the daily-cap config enforces a hard ceiling.

`lib/infobip.ts` deleted in same PR (3 import updates, shim adds permanent noise). `features.multiSender` flag is reserved for a separate concern (per-trigger sender override UI) — orthogonal to provider selection, untouched here.

---

## 10. Out of Scope (v1)

- Inbound message webhooks from Wasender. (Webhook signing is a static-string compare, not HMAC — defer with a security note when we wire it.)
- Media (image, video, document, audio, sticker).
- Admin UI for QR linking / session monitoring. Operator does this in Wasender's dashboard for v1.
- Provider fallback chains ("if Wasender fails, try Infobip"). Explicit + observable > clever.
- Circuit breaker / queue / state machine / DI container.
- Migrating Mechinat Gvana off Infobip. Wait for ≥30 days of Client 2 on Wasender with zero ban events before even discussing.

---

## 11. Decisions & Remaining Open Questions

### Decided (2026-05-11 with user)

1. ✅ **Daily cap default: 60/day during warm-up.** Configurable per client. Raise to 120 after Client 2 runs 3+ weeks without a ban event.
2. ✅ **Tick strategy: N-per-tick with N=8.** `integrations.whatsapp.batchSize` in `client.config.ts`, default 8. Tune per client without code changes.
3. ✅ **Template registry location: separate JSON file per client** at `config/wasender-templates.<slug>.json`.

### Still open — proposed defaults, speak up if any are wrong

4. **Wasender session linking UX (v1):** operator scans QR inside Wasender's own dashboard. Admin UI for QR + status inside our dashboard is **v2 scope**. Acceptable for first onboarding.
5. **`features.multiSender` flag:** stays `false` and is **not touched** by this PR. Its semantics ("per-trigger sender override UI") are a separate concern from provider selection. Confirm before merge.

---

## 12. Implementation Plan Preview (for `writing-plans` next)

Rough task slicing — `writing-plans` will turn this into TDD-sized steps:

1. **Scaffolding** — Create `lib/whatsapp/{types.ts, index.ts}`, write the factory, no providers wired yet. Update `client.config.ts` schema with `whatsapp.provider` defaulted to `"infobip"`.
2. **Move Infobip behind interface** — Migrate `lib/infobip.ts` → `lib/whatsapp/providers/infobip.ts`, implement `WhatsAppProvider`. Update 3 call sites. Delete old `lib/infobip.ts`. Tests + green. Mechinat Gvana smoke check on preview.
3. **Wasender provider skeleton** — `lib/whatsapp/providers/wasender.ts` with `getConfig()`, env reads, `getTemplates()` reading local registry. Throws `config` / `bad_request` on the wrong inputs.
4. **Wasender send path** — `POST /api/send-message` with body, error mapping to the `kind` union, including `session_down`. Tests with `fetch` mocked.
5. **Pacing module** — `lib/whatsapp/pacing.ts` with jitter, daily cap (Sheets-backed count), per-session concurrency. Tests.
6. **Wire pacing into Wasender send** — and into the cron tick (process-N-per-tick).
7. **End-to-end smoke** on Vercel preview, both providers (G6 from playbook).

Each task: implementer subagent → spec-reviewer subagent → code-quality-reviewer subagent (per `superpowers:subagent-driven-development`). All `subagent_type: "general-purpose"`, specialized via prompt.

---

## 13. Verification Gates (from orchestration playbook)

| Gate | Owner | Trigger |
|---|---|---|
| G1 — Spec approval | **HUMAN** | This document — user says approved |
| G2 — Plan approval | **HUMAN** | After `writing-plans` produces the plan |
| G3 — Per-task spec compliance | spec-reviewer subagent | Inside each implementation task |
| G4 — Per-task code quality | code-quality-reviewer subagent | After G3 ✅ |
| G5 — `npm test` green | orchestrator | After all tasks complete |
| G6 — Real WhatsApp + CAPI smoke | **HUMAN** | On Vercel preview, both providers |
| G7 — Ship choice | **HUMAN** | `finishing-a-development-branch` menu |
