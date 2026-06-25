# Phase 2 (qualified-conversion CAPI) — Guy's deploy + verify checklist

Code is DONE on local `main` (commits `3e04625..HEAD`, 51/51 tests, 3 adversarial
passes incl. a cold audit → SHIP-IT). **Nothing is deployed yet** — these are the
human/Meta-side steps that turn "built" into "working."

## A. Deploy (unblocks everything else)
- [ ] **Push `main`** — 15 local commits incl. all of Phase 2. `git push origin main`
      → Vercel auto-deploys from GitHub `guydotan55/gvana-leads`. (Want a preview
      first instead of straight-to-prod? The change is additive + Phase-1-isolated,
      so prod is low-risk — but a preview lets you run the test below without
      touching real attribution. Either works.)
- [ ] **Confirm the Vercel build is green** (watch the build log). NOTE: `next build`
      hangs on *this local machine* (a local webpack/SWC quirk) — Vercel's build env
      is unaffected, but glance at the log to be sure.
- [ ] **Confirm both crons are registered** in the Vercel dashboard:
      `/api/cron/triggers` and `/api/cron/capi-retry` (daily `0 1 * * *`).

## B. Config + Meta setup
- [ ] **Confirm `FB_PIXEL_ID = 775454794700271`** ("שנת שירות") in Vercel env vars.
- [ ] **Events Manager → "שנת שירות" → Conversion-Leads / lead funnel:** map
      `CompleteRegistration` → the **"qualified"** stage, and `Purchase` → the
      converted stage. *Until this exists, events are received but DON'T optimize
      `QUALITY_LEAD`.*

## C. Verify it actually works (the crux the cold audit flagged)
- [ ] *(safe mode, recommended)* Set `FB_TEST_EVENT_CODE` in Vercel so test events
      go to **Events Manager → Test Events** and don't pollute real attribution.
- [ ] In the dashboard, **mark a test lead `relevant`.**
- [ ] In the Google Sheet, confirm a row appears in **`_capi_conversions_outbox`**
      with `eventName = CompleteRegistration`, and that `status` flips
      `pending` → `done`.
- [ ] In **Events Manager**, confirm the `CompleteRegistration` event arrived:
      tied to **`lead_id`**, carrying `lead_event_source = "Gavna_Leads"` +
      `event_source = "crm"` in custom_data — **AND that it registers as a
      "qualified" lead-stage transition, not just "received."** ← this is the one
      thing that proves the QUALITY_LEAD optimization will actually use our signal.
      If it's received but NOT recognized as a stage transition, ping me — the CRM
      payload fields are config-driven and we can adjust them.
- [ ] *(optional)* Mark a lead `accepted` → confirm a second row `Purchase`.
- [ ] Remove `FB_TEST_EVENT_CODE` when verification is done.

## D. Monitor + regression
- [ ] **For a day or two, confirm real leads keep landing via the webhook** — CRM
      cleanup removed Zapier + Google Sheets, so there's **no fallback** now.
- [ ] **Confirm Phase-1 inbound `Lead` still works** — send a test FB lead, confirm
      it enqueues in `_capi_outbox` and flips to `done` (regression check).

## E. Housekeeping (optional)
- [ ] Decide on the untracked HTML mockups in the repo root
      (`leadgen-flow.html`, `meta-pixels-breakdown.html`, etc.) — keep or delete.

---
*Deferred code follow-ups (pilot-acceptable, in HANDOFF "Open issues"): `idx+2`
row-addressing fragility on manual row-deletion; dormant-duplicate-row clutter.
Neither blocks deploy.*
