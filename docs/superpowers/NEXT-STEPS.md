# Phase 2 (qualified-conversion CAPI) — deploy + verify checklist

Code is DONE on `main` (3 adversarial passes incl. a cold audit → SHIP-IT, 51/51).
**Deployed to production 2026-06-25** (commit `9f9b1a7`). Remaining = Meta-side.

## 🔑 CRITICAL FINDING (from inspecting the live Meta dataset)
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
- [ ] **THE LINCHPIN — Conversion-Leads stage mapping** (Events Manager → "שנת שירות"
      → Leads / Conversion-Leads settings). Check what event the **"qualified"** stage
      keys on, then EITHER:
      - **(preferred)** map `CompleteRegistration` → "qualified" and `Purchase` →
        converted, so our events feed the funnel; OR
      - if the funnel only accepts `lead_status` (the event it's been getting), tell me
        and I'll switch `client.config.ts` `capiEvents.qualified`/`accepted` to match
        (a one-line config change + redeploy — possibly + a stage value in the payload).
      *Until this matches, our events are received + attributed by `lead_id` but DON'T
      optimize `QUALITY_LEAD`.*

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
