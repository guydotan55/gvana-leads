# Wasender Integration Smoke Checklist

**Date:** 2026-05-11  
**Target Gate:** G6 (Manual smoke testing before production release)  
**Scope:** Multi-provider WhatsApp integration (Infobip + Wasender)  
**Test Environment:** Vercel preview deployments + staging

---

## Overview

This checklist verifies the Wasender WhatsApp provider integration alongside the existing Infobip provider. Tests cover:
- **Part A:** Infobip regression (existing flow must not break)
- **Part B:** Wasender integration (new provider works end-to-end)
- **Part C:** Failure paths (error handling + fallback behavior)

Each test is manual and run on a fresh Vercel preview deployment. No automation here—this is human verification before release.

---

## Part A: Infobip Regression Testing

> **Goal:** Verify existing Infobip flows still work after Wasender integration.

### A.1: Template Rendering (Infobip)

- [ ] **Setup:** Preview deployment with `WHATSAPP_PROVIDER=infobip` (default)
- [ ] **Create a lead** via organic form at `/form/gavna` (Hebrew form)
- [ ] **Verify in Sheet:** Lead row appears with correct columns (phone, status, source)
- [ ] **Send WhatsApp message:**
  - Click "Send message" on the lead row
  - Select an Infobip template (e.g., "ברוכים הבאים" / Welcome)
  - Confirm send
  - **Check browser console:** No errors; `POST /api/whatsapp/send` returns `{ success: true }`
- [ ] **Verify message delivery:**
  - If using a real WhatsApp number: message should arrive within 10s
  - If using Infobip sandbox: check Infobip dashboard for delivery status
- [ ] **Template variables render correctly:**
  - Lead name appears in message body (if template uses `{{name}}`)
  - No unrendered `{{ }}` placeholders visible

### A.2: CAPI Event Fire (Infobip)

- [ ] **Setup:** Same preview deployment
- [ ] **Send a message** to a lead via Infobip (from A.1)
- [ ] **Check browser Network tab:**
  - Look for POST request to `https://graph.facebook.com/v18.0/{pixelId}/events` (or similar CAPI endpoint)
  - Request payload includes: `data[0][event_name]="Purchase"` (or relevant event for your client config)
  - Status code: `200` or `2xx`
- [ ] **Verify lead status** updates in Sheet after send
- [ ] **No console errors** related to CAPI

### A.3: Infobip Outbound Failure Handling

- [ ] **Setup:** Simulate Infobip API failure
  - Option 1: Temporarily change `INFOBIP_API_KEY` to an invalid value
  - Option 2: Use a network throttle/block tool to kill requests to Infobip
- [ ] **Attempt to send a message**
- [ ] **Verify error handling:**
  - UI shows an error toast (e.g., "Failed to send message. Please retry.")
  - Lead status does NOT change (idempotency—no partial writes)
  - Browser console logs the error (check `lib/infobip.ts` log statements)
  - No CAPI event fires (silent failure, not swallowing the error)

---

## Part B: Wasender Integration Testing

> **Goal:** Verify Wasender provider works end-to-end and can be toggled on.

### B.1: Provider Toggle (Wasender)

- [ ] **Setup:**
  - Update `client.config.ts` (or `.env.local` override if supported) to set `WHATSAPP_PROVIDER=wasender`
  - Redeploy preview
- [ ] **Verify environment:**
  - `WASENDER_API_KEY` and `WASENDER_API_URL` are set (non-empty)
  - Logs on app startup show: `[Wasender] Initialized` (or similar confirmation message)

### B.2: Template Rendering (Wasender)

- [ ] **Setup:** Same Wasender preview deployment from B.1
- [ ] **Create a lead** via organic form at `/form/gavna`
- [ ] **Verify in Sheet:** Lead appears correctly
- [ ] **Send WhatsApp message:**
  - Click "Send message" on the lead row
  - Select a Wasender template (if templates differ from Infobip, select one labeled "Wasender")
  - Confirm send
  - **Check browser console:** No errors; `POST /api/whatsapp/send` returns `{ success: true }`
  - **Response payload inspection:** Verify response includes `provider: "wasender"` (if logged)
- [ ] **Verify message delivery:**
  - If using a real WhatsApp number: message should arrive within 10s
  - If using Wasender sandbox: check Wasender dashboard for delivery status
- [ ] **Template variables render correctly:**
  - Lead name, phone, or other placeholders appear correctly
  - No unrendered `{{ }}` or similar placeholders

### B.3: CAPI Event Fire (Wasender)

- [ ] **Setup:** Same Wasender preview deployment
- [ ] **Send a message** to a lead via Wasender (from B.2)
- [ ] **Check browser Network tab:**
  - POST to Facebook CAPI endpoint (`https://graph.facebook.com/v18.0/{pixelId}/events`)
  - Payload includes correct event name and user properties (phone hash, etc.)
  - Status: `200` or `2xx`
- [ ] **Verify lead status** updates in Sheet
- [ ] **No console errors** related to CAPI or Wasender

### B.4: Wasender Outbound Failure Handling

- [ ] **Setup:** Simulate Wasender API failure
  - Option 1: Change `WASENDER_API_KEY` to an invalid value
  - Option 2: Block/throttle requests to Wasender's API endpoint
- [ ] **Attempt to send a message**
- [ ] **Verify error handling:**
  - Error toast displayed ("Failed to send message. Please retry.")
  - Lead status unchanged (idempotency)
  - Console logs the error with provider context (e.g., `[Wasender] Send failed: ...`)
  - No CAPI event fires

### B.5: Provider Switching

- [ ] **Prerequisite:** Have two preview deployments or use a local environment with provider toggle
- [ ] **Deploy one instance with Infobip, another with Wasender**
- [ ] **Create the same lead on both deployments**
- [ ] **Send a message from each:**
  - Infobip instance → message should arrive via Infobip
  - Wasender instance → message should arrive via Wasender
- [ ] **Verify both instances:**
  - Lead status updated in both Sheets (separate or same Sheet depending on config)
  - CAPI events fired correctly for both providers
  - No cross-contamination (Infobip message did not come from Wasender instance, etc.)

---

## Part C: Failure-Path Smoke Testing

> **Goal:** Verify robustness and error recovery.

### C.1: Network Latency & Retry

- [ ] **Setup:** Wasender or Infobip preview deployment
- [ ] **Simulate high latency:**
  - Use browser DevTools Network throttle (e.g., "Slow 3G")
  - Attempt to send a message
- [ ] **Verify:**
  - Message eventually sends (no premature timeout)
  - UI does not lock up (no blocking spinner that never resolves)
  - User can retry if send fails after timeout
- [ ] **Check logs:** No unhandled promise rejections in console

### C.2: Malformed Lead Data (Missing Phone)

- [ ] **Setup:** Wasender or Infobip preview
- [ ] **Manually insert a lead row with empty/invalid phone** (e.g., via Sheet directly or a test endpoint)
- [ ] **Attempt to send a message to that lead**
- [ ] **Verify:**
  - Error toast: "Invalid phone number" or similar
  - No CAPI event fires (don't send an event for a bad lead)
  - Console logs the validation error
  - Sheet row is not updated (no partial writes)

### C.3: Missing Template

- [ ] **Setup:** Wasender or Infobip preview
- [ ] **Create a lead normally**
- [ ] **Attempt to send a message, but:**
  - Select a template that has been deleted or misconfigured in `client.config.ts`
  - Or simulate a missing template ID in the dropdown
- [ ] **Verify:**
  - Error displayed to user: "Template not found" or similar
  - No API call is made (fail fast)
  - Console logs the template error

### C.4: Sheet Write Failure (Disconnection)

- [ ] **Setup:** Wasender or Infobip preview
- [ ] **Simulate Google Sheets API outage:**
  - Temporarily invalidate `GOOGLE_SERVICE_ACCOUNT_*` credentials
  - Or block requests to `www.googleapis.com`
- [ ] **Create a new organic lead via `/form/gavna`**
- [ ] **Verify:**
  - Form shows error: "Failed to save lead. Please try again."
  - User can retry
  - No UI state corruption (form fields still visible for retry)
  - Console logs the Sheets error with context

### C.5: CAPI Failure (No Block on Send)

- [ ] **Setup:** Wasender or Infobip preview
- [ ] **Simulate CAPI outage:**
  - Invalidate Facebook credentials or block requests to `graph.facebook.com`
- [ ] **Send a WhatsApp message**
- [ ] **Verify:**
  - Message still sends to WhatsApp (CAPI failure does not block)
  - Error is logged but not surfaced to user as a blocking error (background task failure)
  - Console logs the CAPI error (optional in UI, mandatory in logs)
  - Lead status still updates in Sheet

### C.6: Duplicate Sends (Idempotency)

- [ ] **Setup:** Wasender or Infobip preview
- [ ] **Send a message to a lead**
- [ ] **Immediately send again** (click "Send message" again before the first completes)
- [ ] **Verify:**
  - Only one message is sent to the user's phone (not two)
  - Sheet shows only one status update entry (if logging outbound sends)
  - No duplicate CAPI events
  - Console logs may show a "request already in progress" or similar de-duplication signal

---

## Part D: Setup Verification (Pre-Test Checklist)

Before running any test, verify the environment:

- [ ] **Vercel preview deployment is live** and accessible
- [ ] **`.env.local` or Vercel env vars are set:**
  - `WHATSAPP_PROVIDER` (infobip or wasender)
  - `INFOBIP_API_KEY`, `INFOBIP_BASE_URL` (if testing Infobip)
  - `WASENDER_API_KEY`, `WASENDER_API_URL` (if testing Wasender)
  - `JWT_SECRET`, `GOOGLE_SERVICE_ACCOUNT_*`, `FB_APP_*`
- [ ] **Google Sheet for client is writable** and accessible
- [ ] **Browser console is open** during all tests (to catch errors early)
- [ ] **Network tab is available** for CAPI and API request inspection
- [ ] **Test phone number** (yours or sandbox) is ready to receive messages

---

## Sign-Off

Once all parts (A, B, C, D) are complete:

- [ ] **All tests passed** — no blockers found
- [ ] **Infobip regression** verified (no regressions from new Wasender code)
- [ ] **Wasender integration** verified (all flows work end-to-end)
- [ ] **Failure paths** verified (errors are handled gracefully)
- [ ] **Ready for G6 gate** — document sign-off date and tester name below

**Tester Name:** ________________  
**Date Tested:** ________________  
**Approval:** ☐ Ready for production / ☐ Blockers found (list below)

### Blockers (if any):
```
(Describe any failures or issues that would prevent release)
```

---

## Rollback Plan

If critical issues are found post-release:

1. **Immediate:** Set `WHATSAPP_PROVIDER=infobip` across all deployments (fallback to known-good provider)
2. **Investigate:** Gather logs from Vercel and Wasender/Infobip dashboards
3. **Fix:** Address root cause in code
4. **Re-test:** Run full Part B + C again before re-enabling Wasender

---

## Notes for Implementer

- **Jest tests** (`npm test`) must pass before this manual checklist is run
- **tsc typecheck** (`npx tsc --noEmit`) must pass (no type errors)
- **npm run build** must complete without errors (no static generation failures)
- All three of the above verify **code-level correctness**; this checklist verifies **end-to-end behavior**
- If a test is flaky or network-dependent, mark it and re-run 2–3 times
- Use real phone numbers for A.1, A.3, B.2, B.4 if possible (sandbox limits visibility)
- Document any environment-specific quirks in the notes section above
