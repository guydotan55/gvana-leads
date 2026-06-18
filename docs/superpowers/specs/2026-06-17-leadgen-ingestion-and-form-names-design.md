# Leadgen Webhook Ingestion + Editable Form Names — Design

**Date:** 2026-06-17
**Status:** Revised after adversarial passes 1-3 + decision answers
(guaranteed CAPI w/ retry, Telegram alerting, fail-loud on missing tab)
**Client:** Mechinat Gvana (`gavna`) — built config-driven for all clients

---

## 1. Problem

Meta Lead Ads currently reach the Google Sheet through a Zapier
connection that nobody on the team controls or fully understands. Each
Zap is scoped to specific forms, so a **new Meta form silently delivers
nothing** — exactly what happened with the form *תוכנית משתמטים* (4
leads collected, 0 reached the app until a manual CSV import).

The app already anticipates owning this: `client.config.ts` has a
`features.webhookFbLeads` flag, `/api/webhooks` is public in
middleware, and `app/api/webhooks/facebook/route.ts` exists — but its
POST handler is a no-op.

Two things are needed:

1. **Ingestion** — the app receives Meta leadgen events directly and
   writes leads to the Sheet, removing the Zapier dependency. New forms
   work automatically.
2. **Editable form names** — the admin can rename how each form is
   labelled in the dashboard, self-serve, without touching the Sheet.

## 2. Goals / Non-Goals

**Goals**
- Receive Meta `leadgen` webhooks, fetch the lead, write it to the
  Sheet, fire a CAPI `Lead` event **for ad optimization**.
- One tab per form, keyed by **form id** (auto-created, named from the
  Meta form name on first sight).
- Idempotent: Meta retries and duplicates never double-write or
  double-fire CAPI.
- A Settings section to edit each form's **display name** (label only).
- Each form shows under its **own name** in the dashboard (no
  auto-grouping by keyword).
- **Guaranteed CAPI delivery** — failed sends are queued and retried, not
  dropped (attribution is the point).
- **Alert on ingestion failures** — Telegram (to Guy) + an `_errors` log
  tab; fail loud, never silent.
- Fully gated by config; nothing Gvana-specific hardcoded.

**Non-Goals**
- Backfilling historical leads (handled via one-off CSV import).
- Renaming/moving Sheet tabs from the UI (display label only).
- No async queue for **ingestion** (inline is sufficient at this volume).
  The only async piece is the **CAPI retry outbox** (§7a), required by the
  guaranteed-delivery goal.
- Per-user auth or any auth change.

## 3. Architecture

```
Meta (Page leadgen webhook)
        │  POST  {leadgen_id, form_id, page_id}
        ▼
/api/webhooks/facebook  (POST)        ← gated by features.webhookFbLeads
        │  1. verify X-Hub-Signature-256 (FB_APP_SECRET)
        │  2. for each leadgen change:
        ▼
lib/leadgen.ts
   ├─ resolveTab(form_id)     → form_id→tab map; else fetchFormName + create
   ├─ fetchLead(leadgen_id)   → Graph GET /{id}?fields=...
   └─ mapToRow(lead)          → A–P column array (plain values, no prefixes)
        ▼
lib/sheets.ts (new helpers)
   ├─ leadExists(leadgenId, sheetTab)  ← dedup (strip l: both sides)
   ├─ ensureFormTab(formId, formName)  ← resolve by form_id, create if unseen
   └─ appendLead(tab, row)
        ▼
_capi_outbox (pending) + lib/capi.ts sendCAPIEvent("Lead",
   eventId = leadId = leadgen_id, phone via lib/phone.ts) → flip to done
        ▼                                                ← gated by features.capi
Google Sheet  →  dashboard shows the lead (own form name; editable override)

   on any failure → lib/alerts.ts (→ _errors + Telegram)
   daily cron /api/cron/capi-retry → sweeps _capi_outbox pending rows
```

New/changed units, each with one purpose:

- **`app/api/webhooks/facebook/route.ts`** — transport only: verify
  signature, parse, loop changes, call `lib/leadgen.ts`, map HTTP
  status. No business logic.
- **`lib/leadgen.ts`** (new) — all Meta Graph I/O + field mapping +
  name/phone extraction. Normalizes phone via `lib/phone.ts` before CAPI.
  Knows nothing about HTTP or the Sheet's write mechanics.
- **`lib/sheets.ts`** (extend) — `leadExists`, `ensureFormTab`,
  `appendLead`. Reuses existing column config + retry wrapper.
- **`lib/capi.ts`** (extend) — add an optional `eventId` param to
  `sendCAPIEvent`, emitted as the event's `event_id` for dedup. Existing
  callers unaffected.
- **`lib/form-labels.ts`** (new) — read/write the `_form_labels` store;
  serves **both** the `form_id → sheetTab` map (used by ingestion) and
  the editable display label (used by the dashboard).
- **`lib/alerts.ts`** (new) — single alerting entry point: append to the
  `_errors` tab **and** send a Telegram message (Bot API). Used by the
  webhook and the CAPI-retry cron. Dedups repeated alerts (see §7a).
- **`lib/capi-outbox.ts`** (new) — enqueue/read/update the `_capi_outbox`
  retry queue.
- **`app/api/cron/capi-retry/route.ts`** (new) — daily cron that retries
  failed CAPI sends with backoff; alerts on final give-up.
- **Settings UI** — "שמות טפסים" section + `/api/form-labels` endpoint.

## 4. Data Flow — Webhook (per request)

1. **Verify signature.** Read the raw body, compute
   `HMAC-SHA256(FB_APP_SECRET, rawBody)`, compare to the
   `X-Hub-Signature-256` header. Mismatch → `403`.
2. **Feature gate.** If `!features.webhookFbLeads` → `200` (ack, no-op).
3. **Parse.** For each `entry[].changes[]` where `field === "leadgen"`,
   read `value.leadgen_id` and `value.form_id`.
4. **Resolve target tab by form id.** Look up `form_id` in the
   `_form_labels` store (`form_id → sheetTab`).
   - **Mapped but tab missing** (someone deleted/renamed it): **fail loud**
     — do NOT auto-recreate. `alert()` (Telegram + `_errors`, deduped per
     tab) and return `500` so Meta retries until the tab is restored.
   - **Found and present** → that tab.
   - **Unseen `form_id`** → Graph `GET /{form_id}?fields=name`, derive a
     sanitized tab name (§5), create the tab, record the mapping.
   Form-name resolution is cached per `form_id` for the request lifetime.
5. **Dedup.** If `leadExists(leadgen_id, tab)` → skip (no fetch, no
   write, no CAPI). Comparison strips the `l:` prefix on both sides.
   Covers Meta's at-least-once delivery and retries.
6. **Fetch lead.** Graph `GET /{leadgen_id}?fields=created_time,
   field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,
   campaign_name,form_id,is_organic,platform` with the leads token.
7. **Map** → the standard A–P layout from `config/columns.json`, storing
   **plain Graph values** (no synthetic `l:`/`p:` prefixes; the readers
   `stripLeadIdPrefix`/`stripPhonePrefix` are no-ops on plain values, and
   `classifyLead`'s `as:` strip is a no-op too). Extraction rules:
   - **name** = `full_name`, else `join(first_name, last_name)`.
   - **phone** = `phone_number`, else `phone`.
   - **email** = `email` if present.
   - Log loudly if name **or** phone is missing (don't drop the lead).
8. **Write.** `ensureFormTab(form_id, formName)` then `appendLead`.
   `ensureFormTab` is idempotent: if the tab already exists (e.g. a
   concurrent webhook just created it), re-read and reuse it rather than
   failing on a duplicate-name create.
9. **Queue + send CAPI (ad optimization, guaranteed — see §7a).** First
   upsert an outbox row (`_capi_outbox`, `status=pending`, idempotent by
   `leadgenId`). Then attempt `sendCAPIEvent` `Lead` with:
   - `eventId = leadgen_id` → Meta **dedups duplicate sends** (inline vs
     cron retry), so a re-send can't double-count.
   - `leadId = leadgen_id` (raw, no prefix → `user_data.lead_id`, ties
     the event to the lead-ads lead).
   - `phone` **normalized via `lib/phone.ts`** (then `capi.ts` hashes it).
   - `event_time` = "now" (live leads ≈ created_time).
   On success → flip outbox row to `done`. On failure → leave `pending`
   (cron sweeps it). **The whole step — outbox upsert included — is
   skipped when `features.capi` is off.** *(Requires extending
   `sendCAPIEvent` to accept `eventId`.)*
10. **Respond `200`.** (The lead is saved and the CAPI outbox row exists;
    delivery is guaranteed asynchronously, so a CAPI hiccup never fails
    the webhook.)

**Batch semantics.** One webhook POST may carry several changes/leads.
Process each independently; a failure on one lead returns `500` and Meta
retries the **whole** batch — the `leadExists` dedup (step 5) makes that
re-processing safe (already-written leads are skipped, CAPI not
re-fired).

## 5. Data Model

**Lead tabs.** One tab per form, keyed by **form id**. On first sight of
a `form_id`, create a tab named from the Meta form name (sanitized) with
the standard header row (A–P FB columns, Q blank, R–Z dashboard columns)
— identical to existing header-based tabs, so `getLeads()` reads them
with no change. The header includes a known header (`id`, `form_id`, …)
so the tab is detected.

**Tab-name sanitization.** Google Sheets forbids duplicate tab names and
chokes on some characters. Derive the name: strip/replace `'` (would
break the `'<tab>'!A1` range), cap to ~90 chars, and if the name already
exists for a *different* `form_id`, append a short suffix. The `form_id`
(not the name) is the durable key, so display renames never move data.

**Form store** — new internal tab `_form_labels` (the `_` prefix keeps
it out of `getLeads`). It serves two jobs at once:

| formId | sheetTab | label | sourceName | updatedAt |
|--------|----------|-------|-----------|-----------|

- `sheetTab` is the **label key** — labels are per-tab, matching
  `getLeadFilterKey`'s `custom:<sheetTab>`, the per-tab Settings UI, and
  the legacy lump. Each lead tab has at most one row.
- `formId` is used **only for the ingestion `form_id → tab` lookup**. It
  is nullable: the legacy `לידים`/`אורגני` rows have no single formId.
- `label` is the editable display name. Absent → fall back to
  `sourceName` (the Meta form name).
- `sourceName` is the Meta form name, kept for display under the
  editable field and as the fallback label.

So the store answers two questions: ingestion asks "given `formId`, which
tab?" (formId column); the dashboard asks "given `sheetTab`, what label?"
(sheetTab column).

**Backfill (one-time idempotent seed):** a small seed (script or
first-run guard) creates the `_form_labels` tab if missing and upserts
one row: `formId = 859292457130080`, `sheetTab = קמפיין משתמטים`,
`sourceName = תוכנית משתמטים`, `label = קמפיין משתמטים`. Live leads from
that form then append into the existing tab instead of creating a
duplicate. Idempotent: re-running changes nothing.

**Other internal tabs** (both `_`-prefixed, excluded from `getLeads`):

- **`_capi_outbox`** — CAPI retry queue:
  `{ leadgenId, sheetTab, status (pending|failed|done), attempts,
  lastError, nextAttemptAt, updatedAt }`. No PII stored here; the cron
  re-reads the lead by `leadgenId` to rebuild `user_data`.
- **`_errors`** — append-only failure log:
  `{ timestamp, source, leadgenId?, message, context }`. The in-app
  failure "status" surface (per the chosen minimal option) is this tab.

## 6. Editable Form Names (Settings, Option A)

- **`classifyLead` reorder (finding #4):** today keyword checks
  (`מדריך` / `מסע משתחררים` / `טכנולוגית`) run *before* the
  non-legacy-tab → `custom` branch, so a per-form tab whose name contains
  a keyword would be auto-grouped into a core bucket instead of showing
  its own name. Decision: for non-legacy, non-`_` tabs, the **custom
  branch wins first** (label = form name). This also changes existing
  keyword tabs (e.g. "מדריכים למכינה הטכנולוגית") to show their own
  names — confirmed desired. The legacy `לידים`/`אורגני` tabs keep the
  keyword logic (they lump multiple forms).
- **Resolve:** display label = `labelMap[sheetTab]` ?? `classifyLead(lead).label`.
  The override replaces only the **label string**; color/kind still come
  from `classifyLead`. With the reorder above, the no-override fallback is
  already the form's own name. **Apply the resolved label at both render
  sites:** `LeadTable.tsx:43` (the type cell) and `DashboardClient.tsx:229`
  (the custom filter-chip label). `app/api/form-stats/route.ts:57` also
  calls `classifyLead`; its grouping shifts with the reorder — expected,
  verify its output.
- **API** `/api/form-labels`:
  - `GET` → list of `{ sheetTab, formId, currentLabel, sourceName }`
    for every non-internal lead tab. Assembled by listing the lead tabs
    and enriching from `_form_labels` where a row exists; for tabs with no
    row yet (existing tabs predating the store), derive `formId`/
    `sourceName` from the tab's leads and `currentLabel` from
    `classifyLead`. (The legacy `לידים` lump shows as one entry; editing
    it relabels all forms in it — the known limitation.)
  - `PUT` → `{ sheetTab, label }` upserts into `_form_labels` (keyed by
    `sheetTab`).
  - Auth required (dashboard session), like other dashboard APIs.
- **UI** — a "שמות טפסים" section in Settings: a list, each row showing
  the editable name with the Meta source name shown small underneath.
  Per the UX directives: warm casual Hebrew (via `hebrew-content-writer`),
  soft save with an undo toast (no confirm modal), one clear primary
  action. Copy written RTL.
- **Known limitation:** the legacy `לידים` tab lumps several forms
  together; it appears as one editable entry. Per-form tabs going
  forward avoid this. Documented, not solved here.

## 7. Error Handling (fail-loud — no silent `catch {}`)

| Failure | Behaviour |
|---|---|
| Bad/missing signature | `403`, log |
| Feature flag off | `200` ack, no-op |
| Graph lead fetch fails | log error, `500` → Meta retries |
| Sheet write fails | log error, `500` → Meta retries |
| Mapped tab missing | **fail loud**: `alert()` (deduped), `500` → Meta retries until restored. No auto-recreate. |
| CAPI send fails | outbox row stays `pending` (created at ingest); lead saved, respond `200`. Cron retries (§7a); `alert()` on final give-up. |
| Missing name/phone in `field_data` | write the lead anyway with what's present, log loudly + `alert()` (never drop) |
| Duplicate leadgen_id | skip silently-but-logged (expected path) |

Every Graph/Sheet/CAPI failure logs with the `leadgen_id` for tracing.

## 7a. Reliability — Guaranteed CAPI + Alerting

**Guaranteed CAPI delivery (answer #2).** Every ingested lead gets a
`_capi_outbox` row (`status=pending`) created **at ingest**, idempotent
by `leadgenId` (so a Meta redelivery / dedup-skip never loses it). The
inline send (§4 step 9) flips it to `done` on success; otherwise it stays
`pending`. Both inline and retry use `eventId = leadgen_id`, so Meta
collapses duplicate sends — no double-count. The new cron
`/api/cron/capi-retry` (daily, Bearer `CRON_SECRET`, gated by
`features.capi`):
1. reads `_capi_outbox` rows that are due (`status=pending`,
   `nextAttemptAt ≤ now`, `attempts < MAX` (e.g. 5));
2. re-reads each lead by `leadgenId` (using the row's `sheetTab`) to
   rebuild `user_data` (phone via `lib/phone.ts`), re-sends `Lead` with
   the same `eventId`;
3. on success → `status=done`; on failure → `attempts++`, set next
   backoff, record `lastError`;
4. on reaching `MAX` → `status=failed` + `alert()` ("CAPI gave up for
   lead X");
5. if the lead/tab can't be found (e.g. tab deleted) → `alert()`, mark
   `failed`, don't crash the whole run.

⚠️ Vercel cron is **daily** (current plan), so retries are once/day; the
first attempt is immediate, only failures wait. Acceptable for
ad-optimization attribution windows. Faster retries need a finer cron
(Vercel plan dependent). `nextAttemptAt` is kept for future finer crons;
with a daily cron it just means "next run."

**Alerting (answer #5).** `lib/alerts.ts` `alert(key, message, context)`:
1. **always** appends a row to `_errors` (logging is independent of
   Telegram and of `features.alerts`);
2. if `features.alerts` **and** Telegram env are present, sends a Telegram
   message via Bot API
   (`https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage`,
   `chat_id = TELEGRAM_CHAT_ID`);
3. **dedups the Telegram send** using `key`: before sending, checks
   `_errors` for a recent row with the same `key` (within a window) and
   skips the Telegram send if found. Dedup state is the **persisted**
   `_errors` tab — not in-memory — because serverless invocations don't
   share memory, so a Meta retry storm or the daily cron can't spam
   Telegram.

`alert()` **never throws** — a failing alert (e.g. Telegram down) must not
break ingestion or the cron. Alert triggers: missing mapped tab, missing
name/phone, CAPI final give-up, and any Graph/Sheet failure returning
`500`.

## 8. Security

- HMAC signature verification on every POST (`FB_APP_SECRET`).
- Leads token (`FB_ACCESS_TOKEN` if it carries `leads_retrieval`, else a
  new `FB_PAGE_ACCESS_TOKEN`) stays server-side; never logged.
- Endpoint stays public in middleware (Meta is unauthenticated) but is
  protected by the signature check.
- New env (server-side, never logged): `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_CHAT_ID`. Existing `CRON_SECRET` guards the new cron.
- `_errors` may contain `leadgenId` + messages but **no raw PII** beyond
  what's already in the sheet; alert text must not include phone/email.

## 9. Multi-Client / Config

- Gated by `features.webhookFbLeads`; CAPI by `features.capi`; alerting by
  a new `features.alerts` flag (added to `ClientConfig.features`).
- Graph API `v21.0` (matches `lib/capi.ts:72`).
- New cron in `vercel.json`: `/api/cron/capi-retry` (daily). Note the
  Vercel plan cron limits (count + frequency).
- No `if (slug === …)`. Per-form-tab + label + alert logic is generic.

## 10. Testing

- **Unit:** signature verify (valid/invalid); `field_data` → row mapping
  (full_name vs first+last, missing email, plain values); name/phone
  missing path; dedup (with/without `l:` prefix); tab-name sanitization
  (apostrophe, length, duplicate-name suffix); `form_id → tab`
  resolution incl. the backfilled form; phone normalization via
  `lib/phone.ts`; `classifyLead` reorder (keyword tab → own name; legacy
  tab unchanged); label override resolution; **CAPI outbox** always-create
  (idempotent by leadgenId) + inline flip-to-done + cron retry/backoff +
  final give-up; **`event_id` dedup** (inline+retry → single event);
  **alert dedup persisted via `_errors`**; **missing mapped tab** →
  fail-loud path; cron handles vanished tab/lead; `alert()` never throws
  when Telegram env is absent or `features.alerts` is off.
- **Manual:** Meta **Lead Ads Testing Tool** → confirm a test lead lands
  in the right tab, dashboard shows the form's own name, CAPI event
  appears in Events Manager (test event code). To test without disrupting
  prod: temporarily point the leadgen subscription at the **preview**
  deployment URL, or accept prod testing and delete the test row after.
- Per project policy: tests for new code only.

## 11. Rollout (Meta-side — Guy)

1. Identify which app's `App ID` / `App Secret` are in the deployment
   env (Vercel) — likely **Gavna_Leads** (`1405790801105551`) or
   **leads automation – גוונא** (`1613612493379661`). Webhook signature
   + leads token must belong to the **same** app.
2. In that app: **Webhooks → Page → subscribe `leadgen`**, callback
   `https://<deployment>/api/webhooks/facebook`, verify token =
   `FB_WEBHOOK_VERIFY_TOKEN`.
3. Confirm the token has **`leads_retrieval`** (dev-mode app on an owned
   page usually needs no App Review; otherwise submit for review).
4. Deploy, test with the Lead Ads Testing Tool.
5. **Turn off the Zapier Zap** so leads aren't written twice. (Dedup
   protects against overlap during the switch.)
6. Set env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (create the bot,
   start a chat with it, grab the chat id); confirm `CRON_SECRET` is set.
7. Add the `/api/cron/capi-retry` cron to `vercel.json`.

Code-side prerequisite: seed the `_form_labels` backfill row (§5) so the
existing קמפיין משתמטים form keeps one tab.

## 12. Risks / Open Questions

- **App Review timing** — if `leads_retrieval` needs review, code ships
  ready but leads flow only after approval. *(open)*
- **Which app + token** — confirm which of Gavna_Leads /
  leads-automation has `leads_retrieval`, and that it's the same app
  whose `FB_APP_SECRET` is in the deployment env. *(Guy to check — open)*
- **Dedup latency** — `leadExists` reads only the target tab + the
  webhook does ≤2 Graph calls inline; well within Meta's timeout at
  current volume. Revisit if volume grows (e.g. fire CAPI after the 200).
- **Phone format (build-time check)** — confirm `normalizePhone()`'s
  output is what Meta expects for hashing (country-code digits, no `+`,
  no spaces); adjust the call in `lib/leadgen.ts` if it returns a
  different shape (e.g. `0…` or `+972…`).
- **Legacy `לידים` tab** — multi-form lump; shows/edits as one entry.
  Per-form tabs going forward avoid this; not solved here.
- **CAPI dedup window edge** — `event_id` collapses inline+retry
  duplicates within Meta's dedup window (~48h). A retry that lands >48h
  after a *silently-succeeded* first send could double-count one `Lead`.
  Rare, low impact (extra optimization signal); accepted.
- **`_capi_outbox` growth** — an audit row per lead. Low volume makes
  this fine; the cron may prune old `done` rows if it ever matters.

## 13. Phasing

Buildable in two shippable phases:

- **Phase 1 — Ingestion + reliability:** webhook + `lib/leadgen.ts` +
  sheets helpers + inline CAPI + the `classifyLead` reorder + the
  `_form_labels` store **map portion** (`formId`/`sheetTab`/`sourceName`
  + the backfill row) + **guaranteed CAPI** (`_capi_outbox` +
  `/api/cron/capi-retry`) + **alerting** (`lib/alerts.ts` → `_errors` +
  Telegram, with the fail-loud-on-missing-tab guard) + tests. Delivers
  the core fix with the reliability guarantees you asked for.
- **Phase 2 — Editable form names:** the `label` column + label
  resolution in the dashboard + `/api/form-labels` + the "שמות טפסים"
  Settings UI.

(Reliability is in Phase 1 because guaranteed CAPI and fail-loud alerting
are stated requirements, and the missing-tab guard depends on the store
that Phase 1 already builds.)

Phase 1 needs the store for `form_id → tab` resolution and the backfill,
so the store is created in Phase 1; Phase 2 only adds the editable label
layer on top.
