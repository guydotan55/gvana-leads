# HANDOFF — Leadgen Webhook + Qualified-Conversion CAPI (2026-06-24)

Context ran low mid-session; this is the durable state to resume from. Working
on `main` directly (user explicitly chose no worktree — honor it; warn once if
re-raising). Subagents kept auto-creating git worktrees from the global skill —
**every implementer/fixer dispatch MUST say: "do NOT create a worktree/branch,
do NOT `git stash`, stay on `main`, commit to `main`."**

## Where we are

### Phase 1 — Leadgen webhook ingestion: ✅ DONE, LIVE, VERIFIED
- Spec `docs/superpowers/specs/2026-06-17-leadgen-ingestion-and-form-names-design.md`;
  plan `docs/superpowers/plans/2026-06-17-leadgen-ingestion-phase1.md`.
- Built (12 tasks, subagent-driven), merged to main, deployed. Real test lead
  flowed `200` → sheet + `_capi_outbox` + `_form_labels`. A real "לידים כללי
  2026" lead came in overnight via the webhook — it works.
- The webhook is **page-wide** (every form on the page), gated by
  `features.webhookFbLeads`.

### Phase 2 — Qualified-conversion CAPI hardening: ✅ BUILT + REVIEWED on main (2026-06-25), NOT YET DEPLOYED
- Spec `docs/superpowers/specs/2026-06-24-qualified-conversion-capi-design.md`
  (converged through 2 adversarial passes; SHIP-IT).
- Plan `docs/superpowers/plans/2026-06-24-qualified-conversion-capi.md` (`3e04625`);
  written via writing-plans, **2 adversarial passes → SHIP-IT** (pass 1 caught the
  inline-vs-cron re-mark disagreement; fixed via `upsertPending` returning `armed`).
- **Built subagent-driven on main, 6 commits `786320a..0843b62`** — each task
  spec+quality reviewed clean. **Final whole-branch adversarial review (opus): SHIP IT
  AS IS**, 0 findings. Gates: tsc clean, lint clean (2 pre-existing unrelated `<img>`
  warnings), 41/41 tests, Phase-1 (`_capi_outbox`, webhooks) untouched. NOTE: `next
  build`'s webpack step HANGS in this env (pre-existing/environmental, not the diff) —
  gated via tsc+lint+jest instead.
- **REMAINING = nothing code-side.** Next: (1) the Meta-side user actions below
  (pixel-id confirm + lead-stage mapping — until the mapping exists, events are
  received/attributed but DON'T optimize `QUALITY_LEAD`); (2) deploy preview + run the
  manual-verification steps in the plan (mark a test lead `relevant` → row in
  `_capi_conversions_outbox` flips `pending`→`done`; re-mark dedup no-op; failed→re-arm;
  no-phone lead; Phase-1 inbound Lead still works).
- Design (final): a SEPARATE `_capi_conversions_outbox` keyed by
  `(leadgenId, eventName)` — Phase 1's `_capi_outbox` stays untouched. Trigger
  (already the code's logic): `relevant`|`not_relevant_target` → `capiEvents.qualified`;
  `accepted` → `capiEvents.accepted`; `under_review`/`not_relevant` → nothing.
  Guaranteed via the daily cron gaining a 2nd sweep. Normalize phone via
  `lib/phone.ts`; `event_id = leadId = leadgenId` (dedup); preserve `event_time`;
  config-driven event names; `leadId`-empty guard (skip organic/manual leads);
  retire dead `/api/leads/qualify`.

## Planned files for Phase 2 (for the plan)
- `lib/capi.ts` (modify) — add optional `eventTime?: number`; `event_time =
  params.eventTime ?? Math.floor(Date.now()/1000)`.
- `lib/capi-conversions.ts` (create) — pure: `resolveConversion(status, lead,
  events, nowSec)`, `parseConvRows`, `isDue`, `keyOf(leadgenId,eventName)`; I/O:
  `upsertPending(leadgenId,eventName,sheetTab,eventTimeSec,payloadJson)` (resets a
  `failed` row → pending), `markDone(leadgenId,eventName)`,
  `markRetry(leadgenId,eventName,attempts,lastError,nextAttemptAtISO)`, `readDue(nowISO)`.
  Header/cols (read range **A1:I**): `leadgenId,eventName,sheetTab,status,attempts,
  lastError,nextAttemptAt,eventTime,payloadJson`. Reuse `getSheets`/`getSheetId`/
  `ensureTabWithHeader` from `lib/sheets.ts`. MAX_ATTEMPTS=5.
- `client.config.ts` (modify) — add `capiEvents: { lead, qualified, accepted }`;
  gavna default `{ lead:"Lead", qualified:"CompleteRegistration", accepted:"Purchase" }`.
- `app/api/leads/[row]/route.ts` (modify) — REPLACE the two fire-and-forget
  `sendCAPIEvent` blocks (relevant/not_relevant_target → CompleteRegistration;
  accepted → Purchase) with: guard `isFeatureEnabled("capi")` + `lead.leadId`
  non-empty → `resolveConversion` → `upsertPending` → `sendCAPIEvent({eventName,
  eventId:leadId, leadId, phone:normalizePhone(lead.phone), customData, eventTime})`
  → `markDone` on ok; wrap so a CAPI hiccup never fails the status update (alert).
- `app/api/cron/capi-retry/route.ts` (modify) — add a 2nd sweep over
  `_capi_conversions_outbox`, replaying `row.eventName`/`payloadJson`/`eventTime`,
  keyed by `(leadgenId,eventName)`; **reuse the single `getLeads()`** already there.
- `app/api/leads/qualify/route.ts` (DELETE) — dead, no callers.
- Tests: `__tests__/capi-event-time.test.ts` (eventTime honored, mock fetch + env),
  `__tests__/capi-conversions-pure.test.ts` (resolveConversion all branches incl.
  leadId-empty→null & under_review/not_relevant→null; parseConvRows; isDue; keyOf).

## Cleanup done this session
- (a) `_form_labels` form `859292457130080` → tab **קמפיין משתמטים**; deleted the
  test **תוכנית משתמטים** tab.
- (b) Removed test outbox row (`2461000681030760`); KEPT real `4272792592974371`
  ("לידים כללי 2026", CAPI `pending`); cleared 9 fake-`444` `_errors` rows.

## OUTSTANDING — user actions (Meta side)
- **(c) Remove duplicate lead sources: ✅ DONE (2026-06-25).** In מכינות מחיר →
  Leads Access → מכינת גוונא Page → CRMs, **both Zapier AND Google Sheets were
  removed in one go; only `Gavna_Leads` (our app/webhook) remains** → single source of
  truth, cross-tab dupes killed. (User pulled both at once rather than the staged
  Zapier-then-wait-a-day plan — fine since the webhook is live + verified, but there's
  now NO fallback, so watch the dashboard for a day or two that real leads keep landing
  via the webhook; re-add Google Sheets from that same CRMs tab if anything looks off.)
- Confirm `FB_PIXEL_ID` in Vercel = **`775454794700271`** ("שנת שירות").
- For `QUALITY_LEAD` optimization to actually use our signal: in Events Manager →
  "שנת שירות" → Conversion-Leads lead-stage setup, **map `capiEvents.qualified`
  to the "qualified" stage**. Set `capiEvents.qualified` in config to that event.

## Open issues / follow-ups
- Real lead `4272792592974371`'s inbound CAPI is `pending` — inline send didn't
  succeed; cron should retry. Worth checking why (phone norm? token? transient).
- Zapier+webhook overlap created duplicates (e.g. some forms in old "לידים" tab AND
  new per-form tabs). Clean once Zapier is off.
- Page-wide webhook → forms once lumped in "לידים" now get per-form tabs (intended);
  old rows stay in "לידים" (one-time discontinuity).
- Double "Lead": `/api/messages/send` fires `Lead` on send + webhook fires on arrival.
  Out of scope; later (likely → `Contact`).
- Untracked HTML mockups in repo root (leadgen-flow.html, form-name-edit-options.html,
  meta-pixels-breakdown.html, etc.) — discussion artifacts; keep or delete (user's call).
- **Phase 2 cold-audit residual (deferred, pilot-acceptable):** `_capi_conversions_outbox`
  `writeRow` addresses rows by `idx+2` (filtered-array index ↔ physical sheet row).
  If a row is MANUALLY deleted from that internal `_`-tab between a cron `readAll` and a
  same-cycle `mark*`, a later `update` can hit the wrong row. Inherited from Phase-1's
  `_capi_outbox`; low odds (internal tab, team works the lead tabs). Proper fix = address
  by re-found physical row, not array index. (The other cold-audit residual — the
  two-pendings-no-done double-send — was CLOSED in `b936335` via per-key collapse in `dueRows`.)

## Key code facts
- `lib/capi.ts`: `CAPIEventParams {eventName,phone,leadId,fbc,fbp,sourceUrl,customData,eventId}`;
  `sha256(value.trim().toLowerCase())` (NO phone normalization — normalize before passing);
  `action_source:"system_generated"`; Graph `v21.0`; gated by `isFeatureEnabled("capi")` + `FB_PIXEL_ID`+`FB_ACCESS_TOKEN`.
- `lib/capi-outbox.ts` (Phase 1, DO NOT TOUCH): keyed by `leadgenId`, 6 cols, read `A1:F`.
- `app/api/cron/capi-retry/route.ts`: Bearer `CRON_SECRET`; daily `vercel.json` cron `0 1 * * *`;
  matches lead by `l.leadId === row.leadgenId && l.sheetTab === row.sheetTab`.
- `getLeads()` strips `l:` from leadId and `p:` from phone (so `lead.leadId`/`lead.phone` are clean).
- Tests: jest, `__tests__/**/*.test.ts`, `npm test`, `@/` alias, node env. Tests for new code only.
- `classifyLead` (lib/lead-type.ts): non-legacy/non-`_` tab → `custom`, label = sheetTab (reordered in Phase 1).

## IDs / reference
- Vercel: project `prj_KXp4EErqtRtY8JUE6VCBi8wqRFY5`, team `team_mhSk8VqqVjRxOwNO0nf8284j`
  (guydotan55's account), domain `gvana-leads-dashboard.vercel.app`. (`.vercel/project.json`
  on disk is STALE — points at a different "smartmoves" project; ignore it.)
- Meta app **Gavna_Leads** = `1405790801105551`. Page **מכינת גוונא** = `557539187438900`.
  Business **המכינה ליוצאים מהעולם החרדי** = `224474733793683`. Ad account `1485406415436888`.
  Page owned by a DIFFERENT business **מכינות מחיר** (couldn't claim Page into our business —
  IG-connected block — so we used a page-admin token instead).
- Dataset "שנת שירות" = `775454794700271`. QUALITY_LEAD ad set "תוכנית ארוכה + טכנולוגית"
  = `120240287649290446` (this is what our qualified-conversion feeds). משתמטים form = `859292457130080`.
- Webhook verify token (set in Vercel + Meta) = `gvana_lead_hook_2026`.
- Meta Ads MCP `ads_get_ad_entities` works (use `last_30d`); it earlier threw spurious
  "OTID" errors — retrying clears it.

## CONTINUE PROMPT (paste into a fresh session)
> Resume the Mechinat Gvana leads project (on `main`, no worktree — subagents must
> NOT create worktrees/branches or `git stash`). Read
> `docs/superpowers/HANDOFF-leadgen-capi.md` first. Phase 1 (leadgen webhook) is
> live; **Phase 2 (qualified-conversion CAPI) is BUILT + fully reviewed on main
> (commits `786320a..0843b62`, final whole-branch review SHIP-IT) but NOT deployed.**
> Next: deploy a preview and run the manual-verification steps from the plan
> (`docs/superpowers/plans/2026-06-24-qualified-conversion-capi.md` → "Manual
> verification" section): mark a test lead `relevant` → confirm a row in
> `_capi_conversions_outbox` flips `pending`→`done` and the event shows in Events
> Manager (test code) tied to `lead_id`; check re-mark dedup, failed→re-arm, no-phone
> lead, and that the Phase-1 inbound `Lead` still works. Then remind me of the
> still-open MY-side actions: (1) CRM cleanup is DONE (only Gavna_Leads left — just
> watch the webhook catches real leads for a day, no fallback now); (2) confirm
> FB_PIXEL_ID=775454794700271 in Vercel; (3) set up the Conversion-Leads lead-stage
> mapping in Events Manager (Leads Center: Intake→Qualified→Converted), mapping
> `capiEvents.qualified` (CompleteRegistration) → the "qualified" stage, so the event
> actually optimizes the QUALITY_LEAD ad set. Until (3) exists, events are received +
> attributed by lead_id but DON'T optimize.
