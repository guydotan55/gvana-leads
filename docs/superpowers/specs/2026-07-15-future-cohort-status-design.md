# Future-Cohort Lead Status — Design

**Date:** 2026-07-15
**Status:** Approved (brainstormed with Guy, options reviewed via AskUserQuestion)

## Problem

Young leads — in the target audience but too young for the current מחזור —
currently get lumped into "לא רלוונטי (קהל יעד)" with everyone else. The team
wants to find them easily before future recruiting cycles and re-contact them.

## Decision

Add a new **top-level lead status** `future_cohort` (label: "צעיר – מחזור עתידי",
color: purple) that the admin picks instead of `not_relevant_target` when the
lead is too young now.

Rejected alternatives:
- **Sub-reason inside not_relevant_target** — second click for the admin, new
  Sheet column, new sub-filter UI. More build for no extra value.
- **Independent tag/flag** — new UI concept + Sheet column; flexibility not needed.
- **Age/year capture** — explicitly declined; the flag alone is enough, age
  details go in the existing notes field.

## Behavior

- **Meta CAPI:** `future_cohort` fires the `qualified_lead` event, same funnel
  stage as `relevant` and `not_relevant_target` (per Guy: these leads should
  feed campaign optimization). Distinct `content_name: "lead_future_cohort"`
  so the three qualified sources are distinguishable in Events Manager.
- **Dedup:** re-marking a lead from `not_relevant_target` → `future_cohort`
  does NOT double-fire — the conversions outbox dedups by (leadgenId, eventName).
- **Finding them later:** the status column in the dashboard (no status filter
  exists today; the picker/badge render from config automatically).
- **Stats bar:** NOT counted as "relevant" — consistent with `not_relevant_target`.
- **Triggers:** none attach to this status (triggers only fire on `new_lead`).

## Changes

| File | Change |
|------|--------|
| `client.config.ts` | Add status `{ key: "future_cohort", label: "צעיר – מחזור עתידי", color: "purple" }` |
| `lib/sheets.ts` | Add `"future_cohort"` to `VALID_STATUSES` (else: PATCH 400s + Sheet reads coerce it to "new") |
| `lib/capi-conversions.ts` | `resolveConversion`: `future_cohort` → `events.qualified`, `content_name "lead_future_cohort"` |
| `app/api/admin/backfill-capi/route.ts` | Add to `QUALIFYING` (accurate skipped-organic counter) |
| `__tests__/capi-conversions-pure.test.ts` | New case: `future_cohort` → qualified event |

Everything else (picker, badge colors incl. purple, SettingsPanel, i18n,
triggers, cron, webhooks) is config-driven or unrelated — verified by
codebase sweep on 2026-07-15.

## Multi-client note

`VALID_STATUSES` and the `resolveConversion` if/else chain duplicate status
knowledge outside `client.config.ts`. This change follows the existing pattern
rather than refactoring; consider making both config-driven before onboarding
the next client.
