# Guaranteed Qualified-Conversion CAPI — Design

**Date:** 2026-06-24
**Status:** Revised after adversarial pass 1 + Meta-campaign grounding (MCP)
**Client:** Mechinat Gvana (`gavna`) — config-driven for all clients
**Builds on:** Phase 1 (leadgen webhook ingestion + `_capi_outbox` + daily retry cron)

---

## 1. Problem & goal

Gvana's live lead-form ad set **"תוכנית ארוכה + טכנולוגית"** (`120240287649290446`)
optimizes on **`QUALITY_LEAD`** — "Maximize number of qualified leads" (40 leads in
the last 30d). That optimization learns from **lead-stage feedback matched by
`lead_id`**, sent to the **"שנת שירות" dataset (`775454794700271`)**. The whole
value of this feature is feeding Meta a *reliable, correct* "this lead is
qualified" signal so it finds more like them.

Today that signal is the weak link (`app/api/leads/[row]/route.ts`):
- **Best-effort** (`sendCAPIEvent(...).catch(log)`) — a transient failure silently
  loses the signal. Phase 1's guaranteed retry covers only the inbound "Lead".
- **Raw `lead.phone`** (not via `lib/phone.ts`) — sloppy secondary match key.
- **No `event_id`** — re-marking double-counts.
- **Hardcoded event names** — can't align to the campaign without code edits.
- Dead, broken `app/api/leads/qualify/route.ts` (sets invalid `"qualified"`
  status; **no callers**).

**Goal:** make the qualified/accepted conversions *guaranteed* (retry outbox),
*correct* (normalized phone, `event_id`, preserved `event_time`), and
*config-aligned* to the `QUALITY_LEAD` campaign — without touching the working
Phase 1 inbound path.

## 2. Trigger & event mapping (confirmed with user)

| Admin sets status | CAPI event sent | Funnel meaning |
|---|---|---|
| `relevant` **or** `not_relevant_target` | `capiEvents.qualified` (default `CompleteRegistration`) | **"qualified"** stage — both mean "in our target audience" (user confirmed: same stage) |
| `accepted` | `capiEvents.accepted` (default `Purchase`) | "converted / admitted" — deeper value |
| `under_review` | — nothing — | (user confirmed: no event) |
| `not_relevant` | — nothing — | wrong audience |

This is already the trigger logic in `[row]/route.ts` (relevant/not_relevant_target
→ one event, accepted → another). **No trigger-logic change** — we harden it.

## 3. Key architecture decision: a SEPARATE conversions outbox

Phase 1's `_capi_outbox` is keyed by `leadgenId` (one inbound Lead per lead) and
its `readAll` reads `A1:F`. Retrofitting it to multi-event (composite key, wider
range, header migration of a live tab) risks the working ingestion path.

**Decision:** add a **new `_capi_conversions_outbox`** tab, keyed by
**(`leadgenId`, `eventName`)**, created fresh with the full schema. Phase 1's
`_capi_outbox`, its webhook enqueue/`markDone`, and its read range stay **exactly
as they are**. The daily cron gains a second sweep over the new tab. No migration,
no Phase-1 regression surface.

`_capi_conversions_outbox` columns:

| leadgenId | eventName | sheetTab | status | attempts | lastError | nextAttemptAt | eventTime | payloadJson |
|-----------|-----------|----------|--------|----------|-----------|---------------|-----------|-------------|

- Key = (`leadgenId`, `eventName`) — a lead can have a `qualified` row and an
  `accepted` row.
- `eventTime` — unix seconds at enqueue (the qualification moment), replayed on retry.
- `payloadJson` — JSON of `customData` (`{content_name, campaign_name}`) so the
  cron replays the exact event regardless of the lead's later status.
- New module `lib/capi-conversions.ts` (read/write/parse/isDue + `keyOf`), reusing
  `getSheets`/`getSheetId`/`ensureTabWithHeader` from `lib/sheets.ts`. `readAll`
  reads `A1:I`.

## 4. Data flow

```
admin PATCH /api/leads/[row]  (status = relevant | not_relevant_target | accepted)
        ▼
status written to sheet (unchanged)
        ▼  guard: only if features.capi AND lead.leadId is non-empty (a real Meta lead)
resolve:  eventName  = capiEvents[stage]            (config, §6)
          customData = { content_name, campaign_name }
          phone      = normalizePhone(lead.phone)   (lib/phone.ts; strip nothing else)
          eventId = leadId = lead.leadId            (dedup + lead-ads match)
          eventTime  = now
        ▼
conversionsOutbox.upsertPending(leadgenId, eventName, sheetTab, eventTime, payloadJson)
   (idempotent on (leadgenId, eventName); if an existing row is `failed`, RESET it
    to pending/attempts=0 so a re-mark fully re-arms the cron)
        ▼
sendCAPIEvent({ eventName, eventId, leadId, phone, customData, eventTime })  inline
   ok   → markDone(leadgenId, eventName)
   fail → leave pending  → daily cron retries

Latency: all three (enqueue → send → markDone) are AWAITED before the PATCH
responds. On Vercel serverless, post-response work isn't reliable, so awaiting is
how we get an *immediate + guaranteed* signal. The ~1–2s cost is fine for a
deliberate, low-frequency status click, and the dashboard's optimistic UI masks
it. (If it ever feels slow, switch the send to `waitUntil`.) The cron reuses the
single `getLeads()` the inbound sweep already performs — it does not call it twice.

/api/cron/capi-retry (daily) — NEW second sweep:
   for each due conversions row → re-read lead by leadgenId+sheetTab →
   normalize phone → sendCAPIEvent({ eventName: row.eventName, eventId/leadId=leadgenId,
   phone, customData: parse(payloadJson), eventTime: row.eventTime })
   ok → markDone(leadgenId, eventName); fail → markRetry(...); give-up → alert(`capi-giveup:<lead>:<event>`)
   (the existing inbound-Lead sweep stays as-is, above this)
```

## 5. `leadId` guard (was the spec's biggest hole)

Organic-form and hand-entered leads have **no `leadId`**. Firing a `QUALITY_LEAD`
conversion for them is unattributable (no `lead_id`), and an empty `leadgenId`
would collide on the outbox key. **The conversion block runs only when
`lead.leadId` is a non-empty string.** Leads without one are skipped (logged at
debug, not alerted — it's expected for organic leads).

## 6. Config-driven event names (multi-client)

Add to `ClientConfig.capiEvents`:

```ts
capiEvents: { lead: string; qualified: string; accepted: string }
// gavna default: { lead: "Lead", qualified: "CompleteRegistration", accepted: "Purchase" }
```

`qualified` **must equal the event mapped as the "qualified" lead stage** in the
Conversion-Leads setup (§9). No `if (slug === …)`. (`lead` documents the inbound
event Phase 1 already sends; not re-wired here.)

## 7. `lib/capi.ts` change

Add optional `eventTime?: number`; `event_time = params.eventTime ?? Math.floor(Date.now()/1000)`.
Existing callers unaffected. (Needed so a day-later retry reports the conversion at
the qualification moment, not retry time.)

## 8. Error handling (fail-loud)

| Failure | Behaviour |
|---|---|
| Outbox enqueue fails (after `withSheetsRetry`) | log + `alert`; **status update still succeeds** (admin action is primary). Honest limit: a *persistent* sheet outage means no row to retry — alerted, not auto-recovered. |
| Inline send fails | row stays `pending`; cron retries |
| Cron send fails | `attempts++`, daily backoff; at `MAX_ATTEMPTS` (5) → `alert("capi-giveup:<lead>:<event>")` |
| `features.capi` off, or `lead.leadId` empty | skip the whole block |
| Lead/tab missing at retry | `alert`, mark failed (matches Phase 1) |

## 9. Meta-side dependencies (yours — the real "align the event")

1. **Dataset match:** confirm `FB_PIXEL_ID` in Vercel = **`775454794700271`** ("שנת שירות").
   (Server events already fired to it during our test, so this is very likely
   already true — just verify.) If it's a different pixel, our feedback never
   reaches the `QUALITY_LEAD` ad set.
2. **Lead-stage mapping (the crux):** `QUALITY_LEAD` optimizes on lead stages, not a
   pixel event. In **Events Manager → "שנת שירות" → the Conversion-Leads / lead
   funnel**, map the event we send (`capiEvents.qualified`) to the **"qualified"
   stage**, and `capiEvents.accepted` to the converted stage. Set
   `capiEvents.qualified` in config to exactly that event name. Until this mapping
   exists, our events are received + attributed by `lead_id` but **don't optimize**.

## 10. Testing (new code only)

- **Pure/unit:** key = (leadgenId, eventName); `payloadJson` round-trip; `isDue`;
  status→event mapping (relevant & not_relevant_target → qualified; accepted →
  accepted; under_review & not_relevant → none); **leadId-empty → skip**; phone
  normalized before hashing; config event resolution; `event_id` present;
  `eventTime` honored by `capi.ts`.
- **Manual:** mark a real test lead `relevant` → a row appears in
  `_capi_conversions_outbox` with `eventName=CompleteRegistration`, flips to
  `done`; event shows in Events Manager (test code) tied to `lead_id`. Force a send
  failure → stays `pending`, cron re-sends. Confirm Phase-1 inbound Lead still
  works unchanged.

## 11. Risks / open items

- **Lead-stage mapping not configured** → events received but no optimization
  (the one thing that makes this worthwhile). Owned by §9.2; flagged, not silent.
- **Double "Lead"** — `/api/messages/send` also fires `Lead` on send (separate
  from inbound). Pre-existing, out of scope; later decision (likely → `Contact`).
- **Outbox write race** — read-then-write, not atomic; two conversions for one
  lead within a second could race. Low volume; same as Phase 1.
- **Re-mark semantics** — relevant↔not_relevant_target → one deduped qualified
  event (same `event_id`). accepted later → separate event. Intended.
- **Minor duplication** — `_capi_conversions_outbox` repeats some
  read/write shape from `_capi_outbox`; accepted for isolation (could factor a
  generic outbox later — explicitly deferred, not forgotten).

## 12. Scope

IN: conversions outbox + cron sweep, `[row]` route hardening, `capi.ts` eventTime,
config events, `leadId` guard, retire `/qualify`, tests.
OUT: `/api/messages/send` "Lead", other CAPI call sites, the Meta-side lead-stage
setup (yours), Telegram, the website (`OFFSITE_CONVERSIONS`) ad set.

## 13. Phasing

One plan. Order: `capi.ts` eventTime → `lib/capi-conversions.ts` (+ pure helpers
& tests) → `[row]` route hardening → cron second sweep → config `capiEvents` →
delete `/qualify` → tests. Phase 1 files (`_capi_outbox`, webhook) are **not
touched**.
