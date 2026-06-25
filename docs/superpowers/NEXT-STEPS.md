# Phase 2 (qualified-conversion CAPI) — deploy + verify checklist

Code is DONE on `main` (3 adversarial passes incl. a cold audit → SHIP-IT, 51/51).
**Deployed to production 2026-06-25** (commit `9f9b1a7`). Remaining = Meta-side.

## ✅ RESOLVED IN CODE (commit `b92fc6e`)
Meta's diagnostic confirmed the funnel needs exact stage names. Code now sends
`initial_lead` (on arrival) → `qualified_lead` (relevant) → `converted_lead`
(accepted), all tagged as CRM events by `lead_id`. After deploy, **watch lead
coverage climb toward the 60% threshold** in Events Manager → "שנת שירות" →
Actions → CRM events → the diagnostic report. New leads build coverage; historical
ones aren't backfilled, so give it a few days of fresh leads.

## 🔑 ORIGINAL FINDING (for context — now addressed)
Over the last 28 days, dataset **"שנת שירות" (`775454794700271`)** received:
- `Lead` ×76 (Phase-1 inbound — good), `PageView` ×2082, `ViewContent` ×69
- **`lead_status` ×12** (last 2026-06-23) — Meta's canonical CRM lead-stage event
- **`CompleteRegistration` ×0, `Purchase` ×0** — our qualified/accepted events have
  NEVER fired (Phase 2 wasn't deployed until today)

**What this means:** the `QUALITY_LEAD` ad set has been learning from `lead_status`
lead-stage events — almost certainly fed by the **Google-Sheets / Zapier CRM
connections you just removed** (Meta's Sheets "track leads" integration emits
`lead_status`). We replaced ingestion with the webhook and now send
`CompleteRegistration`/`Purchase` for qualification — **different event names.**
So the old qualified-signal source is GONE and the new one uses different events.
The Events-Manager mapping MUST be reconciled or QUALITY_LEAD optimizes on nothing.
(There is NO custom conversion on the dataset → it's the native Conversion-Leads
funnel, configured in Events Manager UI, not via API.)

## A. Deploy — ✅ DONE (by Claude)
- [x] **Pushed `main`** (15 commits) → production deploy `dpl_GbuhAsQn6SAhJrhchjNzTZJjuS8t`.
- [x] **Build green** on Vercel, state READY → live at `gvana-leads-dashboard.vercel.app`.
      (The `next build` hang was Claude's local machine only — Vercel built fine.)
- [ ] **Glance at Vercel → Settings → Cron Jobs** to confirm `/api/cron/capi-retry`
      + `/api/cron/triggers` are registered (couldn't read this via API).

## B. Config + Meta setup
- [~] **`FB_PIXEL_ID`** — dataset `775454794700271` confirmed = "שנת שירות", active,
      and already receives our **server (CAPI) events** (`server_last_fired` 2026-06-23),
      so the env var is almost certainly correct. 5-sec confirm in Vercel env if you want.
- [x] **Event names aligned to Meta's funnel** (`initial_lead`/`qualified_lead`/
      `converted_lead`) — done in code (`b92fc6e`). The funnel keys on these exact names.
- [ ] **Watch lead coverage reach ≥60%** (Events Manager → CRM events → diagnostic
      report) over the next few days of fresh leads. Below 60%, conversion-lead
      optimization stays off; once crossed, `QUALITY_LEAD` learns from `qualified_lead`.
- [ ] *(if a stage still shows unmapped)* In the Conversion-Leads settings, confirm
      the funnel recognizes `qualified_lead` as the "qualified" stage — Meta's standard
      names should map automatically, but eyeball it once events flow.

## C. Verify it actually works (the real proof)
- [ ] *(safe)* Set `FB_TEST_EVENT_CODE` in Vercel so test events hit **Test Events**,
      not real attribution.
- [ ] In the dashboard, **mark a test lead `relevant`.**
- [ ] In the Sheet, confirm a row appears in **`_capi_conversions_outbox`**
      (`eventName = CompleteRegistration`) and flips `pending` → `done`.
- [ ] In **Events Manager → Test Events**, confirm `CompleteRegistration` arrived tied
      to **`lead_id`** with `lead_event_source = "Gavna_Leads"` + `event_source = "crm"`
      — **and that the Conversion-Leads funnel registers it as a "qualified" stage
      transition** (this is the real proof; ties back to B's linchpin).
- [ ] *(optional)* mark a lead `accepted` → second row `Purchase`.
- [ ] Remove `FB_TEST_EVENT_CODE` when done.

## D. Monitor + regression
- [ ] **Watch the webhook a day or two** — CRM cleanup removed the fallback.
- [ ] **Confirm Phase-1 inbound `Lead` still works** (send a test FB lead → `_capi_outbox`).

## E. Optional
- [ ] Keep or delete the untracked HTML mockups in the repo root.

---
*Deferred code follow-ups (pilot-acceptable, in HANDOFF): `idx+2` addressing
fragility on manual row-deletion; dormant-duplicate-row clutter. Neither blocks.*
