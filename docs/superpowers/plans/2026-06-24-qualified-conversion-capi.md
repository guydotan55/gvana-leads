# Qualified-Conversion CAPI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the qualified/accepted Facebook CAPI conversions *guaranteed* (retry outbox), *correct* (normalized phone, `event_id`, preserved `event_time`), and *config-aligned* to the `QUALITY_LEAD` campaign — without touching the working Phase 1 inbound-Lead path.

**Architecture:** A NEW `_capi_conversions_outbox` Google-Sheet tab keyed by `(leadgenId, eventName)`, with a pure+I/O module `lib/capi-conversions.ts` mirroring the existing `lib/capi-outbox.ts`. The `PATCH /api/leads/[row]` handler enqueues-then-sends (awaited, guaranteed) instead of fire-and-forget. The daily cron gains a SECOND sweep over the new tab, reusing the single `getLeads()` it already calls. Event names move into `client.config.ts`. Phase 1's `_capi_outbox` and webhook are untouched.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Google Sheets API (`googleapis`), Jest (node env, `@/` alias), Facebook Graph CAPI v21.0.

## Global Constraints

- **Work on `main` directly. Do NOT create a git worktree or branch. Do NOT `git stash`. Commit to `main`.** (User explicitly chose no worktree for this project.)
- **Do NOT touch Phase 1 code:** `lib/capi-outbox.ts`, `app/api/webhooks/**`, the `_capi_outbox` tab, and the inbound-Lead sweep in the cron stay exactly as they are.
- **Phone:** always normalize via `lib/phone.ts` `normalizePhone()` before passing to CAPI. Never roll your own.
- **`lib/capi.ts` `sha256` does NOT normalize** — it lowercases+trims only. Normalize phone before passing.
- **Fail loud, never silent.** No `catch {}` without logging/alerting. A CAPI hiccup must never fail the admin's status update (the admin action is primary) — but it must be logged + `alert()`ed.
- **Config-driven, no slug branching.** Event names come from `clientConfig.capiEvents`. Never `if (slug === "gavna")`.
- **`leadId` guard:** the conversion block runs only when `lead.leadId` is a non-empty string (real Meta lead). Organic/manual leads are skipped silently (expected).
- **`event_id = leadId = lead.leadId`** (the Meta `leadgenId`) — gives both dedup and lead-ads match.
- **MAX_ATTEMPTS = 5**, daily backoff (next attempt = now + 24h), matching Phase 1.
- **Tests for new code only.** Pure helpers get unit tests; route/cron are gated by typecheck + build (mirrors Phase 1, which did not unit-test its route/cron).
- Commit after each task. Use `git add <explicit paths>` — never `git add -A` (untracked HTML mockups live in the repo root).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/capi.ts` | Modify | Accept optional `eventTime` so a day-later retry reports the conversion at the qualification moment. |
| `client.config.ts` | Modify | Add `capiEvents: { lead, qualified, accepted }` to the interface + gavna default. |
| `lib/capi-conversions.ts` | Create | The new conversions outbox: pure helpers (`resolveConversion`, `parseConvRows`, `isDue`, `keyOf`) + I/O (`upsertPending`, `markDone`, `markRetry`, `readDue`). |
| `app/api/leads/[row]/route.ts` | Modify | Replace the two fire-and-forget `sendCAPIEvent` blocks with the guaranteed enqueue→send→markDone flow. |
| `app/api/cron/capi-retry/route.ts` | Modify | Add a second sweep over `_capi_conversions_outbox`, reusing the single `getLeads()`. |
| `app/api/leads/qualify/route.ts` | Delete | Dead + broken (sets invalid `"qualified"` status); no callers. |
| `__tests__/capi-event-time.test.ts` | Create | `eventTime` honored / falls back to now. |
| `__tests__/capi-conversions-pure.test.ts` | Create | `resolveConversion` all branches, `parseConvRows`, `isDue`, `keyOf`. |

---

## Task 1: `lib/capi.ts` — preserve `event_time`

**Files:**
- Modify: `lib/capi.ts:28-37` (interface), `lib/capi.ts:51` (event_time)
- Test: `__tests__/capi-event-time.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `sendCAPIEvent(params)` now accepts optional `params.eventTime?: number` (unix seconds). When omitted, behavior is unchanged (`Math.floor(Date.now()/1000)`).

- [ ] **Step 1: Write the failing test**

Create `__tests__/capi-event-time.test.ts` (mirrors the existing `__tests__/capi-event-id.test.ts` mock pattern — gavna config has `features.capi: true`, so `sendCAPIEvent` proceeds):

```ts
import { sendCAPIEvent } from "@/lib/capi";

describe("sendCAPIEvent eventTime", () => {
  const realFetch = global.fetch;
  beforeAll(() => {
    process.env.FB_PIXEL_ID = "PID";
    process.env.FB_ACCESS_TOKEN = "TOK";
  });
  afterEach(() => { global.fetch = realFetch; });

  it("uses the provided eventTime as event_time", async () => {
    let body: any;
    global.fetch = (async (_url: string, init: any) => {
      body = JSON.parse(init.body);
      return { ok: true, text: async () => "" } as Response;
    }) as any;

    await sendCAPIEvent({ eventName: "CompleteRegistration", eventId: "l1", leadId: "l1", eventTime: 1700000000 });

    expect(body.data[0].event_time).toBe(1700000000);
  });

  it("falls back to now when eventTime is omitted", async () => {
    let body: any;
    global.fetch = (async (_url: string, init: any) => {
      body = JSON.parse(init.body);
      return { ok: true, text: async () => "" } as Response;
    }) as any;

    const before = Math.floor(Date.now() / 1000);
    await sendCAPIEvent({ eventName: "Lead", eventId: "l2", leadId: "l2" });
    const after = Math.floor(Date.now() / 1000);

    expect(body.data[0].event_time).toBeGreaterThanOrEqual(before);
    expect(body.data[0].event_time).toBeLessThanOrEqual(after);
  });
});
```

- [ ] **Step 2: Run the test to verify the first case fails**

Run: `npm test -- capi-event-time`
Expected: the "uses the provided eventTime" test FAILS (event_time is the current second, not `1700000000`). The fallback test passes.

- [ ] **Step 3: Add `eventTime` to the interface**

In `lib/capi.ts`, change the `CAPIEventParams` interface (lines 28-37) to add `eventTime`:

```ts
interface CAPIEventParams {
  eventName: string;
  phone?: string;
  leadId?: string;
  fbc?: string;
  fbp?: string;
  sourceUrl?: string;
  customData?: Record<string, unknown>;
  eventId?: string;
  eventTime?: number;
}
```

- [ ] **Step 4: Use it in the event payload**

In `lib/capi.ts`, change line 51 from:

```ts
    event_time: Math.floor(Date.now() / 1000),
```

to:

```ts
    event_time: params.eventTime ?? Math.floor(Date.now() / 1000),
```

- [ ] **Step 5: Run the tests + typecheck**

Run: `npm test -- capi-event-time && npx tsc --noEmit`
Expected: both tests PASS; tsc prints nothing (exit 0).

- [ ] **Step 6: Commit**

```bash
git add lib/capi.ts __tests__/capi-event-time.test.ts
git commit -m "feat(capi): optional eventTime to preserve conversion event_time on retry"
```

---

## Task 2: `client.config.ts` — config-driven event names

**Files:**
- Modify: `client.config.ts:24-30` (interface, after `features`), `client.config.ts:66-72` (gavna config, after `features`)

**Interfaces:**
- Consumes: nothing.
- Produces: `clientConfig.capiEvents: { lead: string; qualified: string; accepted: string }`. Gavna default `{ lead: "Lead", qualified: "CompleteRegistration", accepted: "Purchase" }`. Tasks 3 & 4 consume `capiEvents.qualified` and `capiEvents.accepted`.

- [ ] **Step 1: Add `capiEvents` to the `ClientConfig` interface**

In `client.config.ts`, immediately after the `features: { ... };` block in the interface (after line 30, before `specialSources`), add:

```ts
  // CAPI event names per stage. `qualified` MUST equal the event mapped to the
  // "qualified" lead stage in Events Manager (Conversion-Leads) for the
  // QUALITY_LEAD ad set to optimize on our signal. `lead` documents the inbound
  // event Phase 1 already sends (not re-wired here).
  capiEvents: { lead: string; qualified: string; accepted: string };
```

- [ ] **Step 2: Add the gavna default**

In `client.config.ts`, immediately after the `features: { ... },` block in the `clientConfig` object (after line 72, before `specialSources`), add:

```ts
  capiEvents: { lead: "Lead", qualified: "CompleteRegistration", accepted: "Purchase" },
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output. (If `capiEvents` were missing from either the interface or the object, strict mode would error.)

- [ ] **Step 4: Commit**

```bash
git add client.config.ts
git commit -m "feat(config): config-driven capiEvents (lead/qualified/accepted)"
```

---

## Task 3: `lib/capi-conversions.ts` — the conversions outbox

**Files:**
- Create: `lib/capi-conversions.ts`
- Test: `__tests__/capi-conversions-pure.test.ts`

**Interfaces:**
- Consumes: `getSheets`, `getSheetId`, `ensureTabWithHeader` from `@/lib/sheets`; `withSheetsRetry` from `@/lib/sheets-retry`. `clientConfig.capiEvents` shape `{ lead, qualified, accepted }` (Task 2).
- Produces (consumed by Tasks 4 & 5):
  - `interface CapiEvents { lead: string; qualified: string; accepted: string }`
  - `interface ResolvedConversion { eventName: string; eventTime: number; customData: { content_name: string; campaign_name?: string } }`
  - `interface ConvRow { leadgenId: string; eventName: string; sheetTab: string; status: "pending"|"done"|"failed"; attempts: number; lastError: string; nextAttemptAt: string; eventTime: number; payloadJson: string }`
  - `function resolveConversion(status, lead, events, nowSec): ResolvedConversion | null`
  - `function keyOf(leadgenId: string, eventName: string): string`
  - `function parseConvRows(rows: string[][]): ConvRow[]`
  - `function isDue(row: ConvRow, nowISO: string): boolean`
  - `async function upsertPending(leadgenId, eventName, sheetTab, eventTimeSec: number, payloadJson: string): Promise<boolean>` — returns `true` if it armed a fresh/re-armed pending row (caller should send inline), `false` if it left an existing `pending`/`done` row untouched (caller must NOT re-send — same `event_id`, Meta would just dedup). This keeps the inline-send path and the cron-retry path in agreement.
  - `async function markDone(leadgenId, eventName): Promise<void>`
  - `async function markRetry(leadgenId, eventName, attempts: number, lastError: string, nextAttemptAtISO: string): Promise<void>`
  - `async function readDue(nowISO: string): Promise<ConvRow[]>`
  - `const MAX_ATTEMPTS = 5`

- [ ] **Step 1: Write the failing pure-logic test**

Create `__tests__/capi-conversions-pure.test.ts`:

```ts
import { resolveConversion, parseConvRows, isDue, keyOf, MAX_ATTEMPTS } from "@/lib/capi-conversions";

const events = { lead: "Lead", qualified: "CompleteRegistration", accepted: "Purchase" };

describe("resolveConversion", () => {
  const lead = { leadId: "lg1", campaignName: "Camp A" };

  it("relevant → qualified event with campaign_name", () => {
    expect(resolveConversion("relevant", lead, events, 1700000000)).toEqual({
      eventName: "CompleteRegistration",
      eventTime: 1700000000,
      customData: { content_name: "lead_relevant", campaign_name: "Camp A" },
    });
  });
  it("not_relevant_target → same qualified event (same stage)", () => {
    const r = resolveConversion("not_relevant_target", lead, events, 1700000000);
    expect(r?.eventName).toBe("CompleteRegistration");
    expect(r?.customData.content_name).toBe("lead_not_relevant_target");
  });
  it("accepted → accepted event", () => {
    const r = resolveConversion("accepted", lead, events, 1700000000);
    expect(r?.eventName).toBe("Purchase");
    expect(r?.customData.content_name).toBe("lead_accepted");
  });
  it("under_review → null (no event)", () => {
    expect(resolveConversion("under_review", lead, events, 1)).toBeNull();
  });
  it("not_relevant → null (wrong audience)", () => {
    expect(resolveConversion("not_relevant", lead, events, 1)).toBeNull();
  });
  it("empty leadId → null (organic/manual lead, unattributable)", () => {
    expect(resolveConversion("relevant", { leadId: "", campaignName: "X" }, events, 1)).toBeNull();
  });
  it("omits campaign_name when the lead has none", () => {
    const r = resolveConversion("relevant", { leadId: "lg1" }, events, 1);
    expect(r?.customData).toEqual({ content_name: "lead_relevant" });
  });
});

describe("keyOf", () => {
  it("composites leadgenId + eventName and distinguishes events", () => {
    expect(keyOf("lg1", "Purchase")).toBe("lg1::Purchase");
    expect(keyOf("lg1", "Purchase")).not.toBe(keyOf("lg1", "CompleteRegistration"));
  });
});

describe("parseConvRows", () => {
  it("parses rows, skips header, round-trips eventTime + payloadJson", () => {
    const rows = [
      ["leadgenId","eventName","sheetTab","status","attempts","lastError","nextAttemptAt","eventTime","payloadJson"],
      ["lg1","CompleteRegistration","tab1","pending","2","err","2026-06-24T00:00:00Z","1700000000",'{"content_name":"lead_relevant"}'],
    ];
    const out = parseConvRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      leadgenId: "lg1", eventName: "CompleteRegistration", sheetTab: "tab1",
      status: "pending", attempts: 2, eventTime: 1700000000,
    });
    expect(JSON.parse(out[0].payloadJson)).toEqual({ content_name: "lead_relevant" });
  });
});

describe("isDue", () => {
  const base = { leadgenId: "lg1", eventName: "Purchase", sheetTab: "t", lastError: "", nextAttemptAt: "2026-06-17T00:00:00Z", eventTime: 1, payloadJson: "" };
  it("pending + due time + under max → due", () => {
    expect(isDue({ ...base, status: "pending", attempts: 1 }, "2026-06-18T00:00:00Z")).toBe(true);
  });
  it("done / maxed / future → not due", () => {
    expect(isDue({ ...base, status: "done", attempts: 1 }, "2026-06-18T00:00:00Z")).toBe(false);
    expect(isDue({ ...base, status: "pending", attempts: MAX_ATTEMPTS }, "2026-06-18T00:00:00Z")).toBe(false);
    expect(isDue({ ...base, status: "pending", attempts: 1, nextAttemptAt: "2026-06-30T00:00:00Z" }, "2026-06-18T00:00:00Z")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- capi-conversions-pure`
Expected: FAIL — `Cannot find module '@/lib/capi-conversions'`.

- [ ] **Step 3: Create the module**

Create `lib/capi-conversions.ts` (mirrors `lib/capi-outbox.ts`, plus `eventName` in the key, `eventTime`/`payloadJson` columns, and a `failed`→`pending` reset in `upsertPending`):

```ts
import { getSheets, getSheetId, ensureTabWithHeader } from "@/lib/sheets";
import { withSheetsRetry } from "@/lib/sheets-retry";

const TAB = "_capi_conversions_outbox";
const HEADER = ["leadgenId", "eventName", "sheetTab", "status", "attempts", "lastError", "nextAttemptAt", "eventTime", "payloadJson"];
export const MAX_ATTEMPTS = 5;

export interface CapiEvents {
  lead: string;
  qualified: string;
  accepted: string;
}

export interface ResolvedConversion {
  eventName: string;
  eventTime: number;
  customData: { content_name: string; campaign_name?: string };
}

export interface ConvRow {
  leadgenId: string;
  eventName: string;
  sheetTab: string;
  status: "pending" | "done" | "failed";
  attempts: number;
  lastError: string;
  nextAttemptAt: string;
  eventTime: number;
  payloadJson: string;
}

/* ---------- Pure helpers ---------- */

// Status → which CAPI conversion to fire. relevant & not_relevant_target are the
// SAME "qualified" stage (both = in our target audience). under_review,
// not_relevant, and any other status fire nothing. Organic/manual leads (empty
// leadId) are unattributable, so they fire nothing either.
export function resolveConversion(
  status: string,
  lead: { leadId: string; campaignName?: string },
  events: CapiEvents,
  nowSec: number
): ResolvedConversion | null {
  if (!lead.leadId) return null;

  let eventName: string;
  let content_name: string;
  if (status === "relevant") {
    eventName = events.qualified;
    content_name = "lead_relevant";
  } else if (status === "not_relevant_target") {
    eventName = events.qualified;
    content_name = "lead_not_relevant_target";
  } else if (status === "accepted") {
    eventName = events.accepted;
    content_name = "lead_accepted";
  } else {
    return null;
  }

  const customData: { content_name: string; campaign_name?: string } = { content_name };
  if (lead.campaignName) customData.campaign_name = lead.campaignName;
  return { eventName, eventTime: nowSec, customData };
}

export function keyOf(leadgenId: string, eventName: string): string {
  return `${leadgenId}::${eventName}`;
}

export function parseConvRows(rows: string[][]): ConvRow[] {
  return (rows || [])
    .filter((r) => r[0] && r[0] !== "leadgenId")
    .map((r) => ({
      leadgenId: r[0],
      eventName: r[1] || "",
      sheetTab: r[2] || "",
      status: (r[3] as ConvRow["status"]) || "pending",
      attempts: parseInt(r[4] || "0", 10) || 0,
      lastError: r[5] || "",
      nextAttemptAt: r[6] || "",
      eventTime: parseInt(r[7] || "0", 10) || 0,
      payloadJson: r[8] || "",
    }));
}

export function isDue(row: ConvRow, nowISO: string): boolean {
  if (row.status !== "pending") return false;
  if (row.attempts >= MAX_ATTEMPTS) return false;
  return (row.nextAttemptAt || "") <= nowISO;
}

/* ---------- I/O ---------- */

async function readAll(): Promise<ConvRow[]> {
  try {
    const sheets = getSheets();
    const res = await withSheetsRetry(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId: getSheetId(),
        range: `'${TAB}'!A1:I`,
      })
    );
    return parseConvRows((res.data.values as string[][]) || []);
  } catch {
    return [];
  }
}

function rowValues(r: ConvRow): string[] {
  return [
    r.leadgenId, r.eventName, r.sheetTab, r.status, String(r.attempts),
    r.lastError, r.nextAttemptAt, String(r.eventTime), r.payloadJson,
  ];
}

async function writeRow(r: ConvRow): Promise<void> {
  await ensureTabWithHeader(TAB, HEADER);
  const sheets = getSheets();
  const all = await readAll();
  const idx = all.findIndex((x) => x.leadgenId === r.leadgenId && x.eventName === r.eventName);
  if (idx === -1) {
    await withSheetsRetry(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId: getSheetId(),
        range: `'${TAB}'!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [rowValues(r)] },
      })
    );
  } else {
    const n = idx + 2;
    await withSheetsRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId: getSheetId(),
        range: `'${TAB}'!A${n}:I${n}`,
        valueInputOption: "RAW",
        requestBody: { values: [rowValues(r)] },
      })
    );
  }
}

// Idempotent on (leadgenId, eventName). Returns whether it armed a pending row:
//  - existing `pending` or `done` row → left ALONE, returns false. A re-mark of
//    the same conversion is a true deduped no-op (same event_id; Meta dedups), and
//    the caller must NOT re-send inline — that's what keeps the inline path and the
//    cron path in agreement (the reviewer's blocker). NOTE: a re-mark that only
//    changes content_name (relevant → not_relevant_target on an already-sent
//    qualified key) intentionally does NOT re-send the corrected content_name —
//    the qualified signal is keyed on event_name (§9.2 lead-stage mapping), so
//    content_name is cosmetic here. If content_name ever becomes load-bearing
//    Meta-side, revisit this.
//  - existing `failed` row → RESET to pending/attempts=0 and re-armed with the new
//    eventTime/payload, returns true. Re-marking a given-up conversion re-arms it.
//  - no row → writes a fresh pending row, returns true.
export async function upsertPending(
  leadgenId: string,
  eventName: string,
  sheetTab: string,
  eventTimeSec: number,
  payloadJson: string
): Promise<boolean> {
  const all = await readAll();
  const existing = all.find((x) => x.leadgenId === leadgenId && x.eventName === eventName);
  if (existing && existing.status !== "failed") return false;
  await writeRow({
    leadgenId, eventName, sheetTab,
    status: "pending", attempts: 0, lastError: "", nextAttemptAt: "",
    eventTime: eventTimeSec, payloadJson,
  });
  return true;
}

export async function markDone(leadgenId: string, eventName: string): Promise<void> {
  const all = await readAll();
  const row = all.find((x) => x.leadgenId === leadgenId && x.eventName === eventName);
  if (!row) return;
  await writeRow({ ...row, status: "done" });
}

export async function markRetry(
  leadgenId: string,
  eventName: string,
  attempts: number,
  lastError: string,
  nextAttemptAtISO: string
): Promise<void> {
  const all = await readAll();
  const row = all.find((x) => x.leadgenId === leadgenId && x.eventName === eventName);
  if (!row) return;
  const status = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
  await writeRow({ ...row, status, attempts, lastError, nextAttemptAt: nextAttemptAtISO });
}

export async function readDue(nowISO: string): Promise<ConvRow[]> {
  const all = await readAll();
  return all.filter((r) => isDue(r, nowISO));
}
```

- [ ] **Step 4: Run the tests + typecheck**

Run: `npm test -- capi-conversions-pure && npx tsc --noEmit`
Expected: all pure tests PASS; tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/capi-conversions.ts __tests__/capi-conversions-pure.test.ts
git commit -m "feat(capi): conversions outbox module keyed by (leadgenId,eventName)"
```

---

## Task 4: `app/api/leads/[row]/route.ts` — guaranteed enqueue→send

**Files:**
- Modify: `app/api/leads/[row]/route.ts:1-3` (imports), `app/api/leads/[row]/route.ts:52-75` (replace both fire-and-forget blocks)

**Interfaces:**
- Consumes: `isFeatureEnabled` from `@/lib/config`; `normalizePhone` from `@/lib/phone`; `clientConfig` from `@/client.config`; `alert` from `@/lib/alerts`; `resolveConversion`, `upsertPending`, `markDone` from `@/lib/capi-conversions` (Task 3).
- Produces: same PATCH HTTP contract (`{ success: true }`). The CAPI side becomes guaranteed; the status update never fails because of CAPI. The inline send fires only when `upsertConvPending` returns `armed === true`.

- [ ] **Step 1: Update imports**

In `app/api/leads/[row]/route.ts`, replace lines 1-3:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getLeads, updateLeadCells, deleteLead, VALID_STATUSES } from "@/lib/sheets";
import { sendCAPIEvent } from "@/lib/capi";
```

with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getLeads, updateLeadCells, deleteLead, VALID_STATUSES } from "@/lib/sheets";
import { sendCAPIEvent } from "@/lib/capi";
import { isFeatureEnabled } from "@/lib/config";
import { normalizePhone } from "@/lib/phone";
import { clientConfig } from "@/client.config";
import { alert } from "@/lib/alerts";
import {
  resolveConversion,
  upsertPending as upsertConvPending,
  markDone as markConvDone,
} from "@/lib/capi-conversions";
```

- [ ] **Step 2: Replace both fire-and-forget CAPI blocks**

In `app/api/leads/[row]/route.ts`, replace the entire block at lines 52-75 (the `// Fire CAPI events on meaningful status changes` comment through the end of the `accepted` block) with:

```ts
    // Fire qualified/accepted CAPI conversions — guaranteed (outbox + retry),
    // correct (normalized phone, event_id, preserved event_time), config-driven.
    // Gate is `lead.leadId` (the Meta lead_id match key), NOT phone as before:
    // organic/manual leads have no lead_id → unattributable → skipped. A lead may
    // have a leadId but no phone; we still fire (lead_id alone attributes), passing
    // phone only when present. A CAPI hiccup must NEVER fail the status update —
    // the admin action is primary; we log + alert instead.
    if (isFeatureEnabled("capi") && lead.leadId) {
      const resolved = resolveConversion(
        status,
        lead,
        clientConfig.capiEvents,
        Math.floor(Date.now() / 1000)
      );
      if (resolved) {
        try {
          const payloadJson = JSON.stringify(resolved.customData);
          // `armed` is false when an existing pending/done row is left untouched —
          // a same-stage re-mark is a deduped no-op, so we do NOT re-send inline
          // (this is what keeps the inline path and the cron-retry path in sync).
          const armed = await upsertConvPending(
            lead.leadId,
            resolved.eventName,
            lead.sheetTab,
            resolved.eventTime,
            payloadJson
          );
          if (armed) {
            const ok = await sendCAPIEvent({
              eventName: resolved.eventName,
              eventId: lead.leadId,
              leadId: lead.leadId,
              phone: lead.phone ? normalizePhone(lead.phone) : undefined,
              customData: resolved.customData,
              eventTime: resolved.eventTime,
            });
            // Inline-send failure leaves the row `pending` → daily cron retries.
            if (ok) await markConvDone(lead.leadId, resolved.eventName);
          }
        } catch (err) {
          // Persistent sheet outage: no row to retry. Alerted, not auto-recovered.
          // (alert() never throws — it swallows internally — so no inner catch.)
          console.error("CAPI conversion enqueue/send failed:", err);
          await alert(
            `capi-conv-enqueue:${lead.leadId}:${resolved.eventName}`,
            `CAPI conversion failed to enqueue/send for lead ${lead.leadId} (status ${status})`,
            String(err)
          );
        }
      }
    }
```

- [ ] **Step 3: Typecheck + full test run**

Run: `npx tsc --noEmit && npm test`
Expected: tsc exit 0; all jest suites PASS (no regressions in the existing suites).

- [ ] **Step 4: Lint the route**

Run: `npm run lint`
Expected: no errors (warnings tolerated only if pre-existing). Confirm no unused-import warnings for the new imports.

- [ ] **Step 5: Commit**

```bash
git add "app/api/leads/[row]/route.ts"
git commit -m "feat(capi): guaranteed qualified/accepted conversions on status change"
```

---

## Task 5: `app/api/cron/capi-retry/route.ts` — second sweep

**Files:**
- Modify: `app/api/cron/capi-retry/route.ts:1-7` (imports), insert a second sweep after the inbound loop (after line 44), and extend the JSON response (line 46).

**Interfaces:**
- Consumes: `readDue`, `markDone`, `markRetry`, `MAX_ATTEMPTS` from `@/lib/capi-conversions` (Task 3); the single `leads`, `now`, `nowISO` already computed in the handler.
- Produces: same GET contract plus `convProcessed` + `convResults` in the JSON.

- [ ] **Step 1: Add the conversions imports (aliased to avoid clashing with the outbox imports)**

In `app/api/cron/capi-retry/route.ts`, after the existing import block (lines 1-7), add:

```ts
import {
  readDue as readConvDue,
  markDone as markConvDone,
  markRetry as markConvRetry,
  MAX_ATTEMPTS as CONV_MAX_ATTEMPTS,
} from "@/lib/capi-conversions";
```

(The existing `import { readDue, markDone, markRetry, MAX_ATTEMPTS } from "@/lib/capi-outbox";` stays — those names serve the inbound sweep.)

- [ ] **Step 2: Insert the second sweep**

In `app/api/cron/capi-retry/route.ts`, between the end of the inbound `for (const row of due) { ... }` loop (currently line 44) and the `return NextResponse.json(...)` (currently line 46), insert:

```ts

  // --- Second sweep: qualified/accepted conversions outbox (reuses `leads`) ---
  const convDue = await readConvDue(nowISO);
  const convResults: { leadgenId: string; eventName: string; ok: boolean }[] = [];

  for (const row of convDue) {
    const lead = leads.find((l) => l.leadId === row.leadgenId && l.sheetTab === row.sheetTab);
    if (!lead) {
      await markConvRetry(row.leadgenId, row.eventName, CONV_MAX_ATTEMPTS, "lead/tab not found", nowISO);
      await alert(
        `capi-conv-missing:${row.leadgenId}:${row.eventName}`,
        `CAPI conversion retry: lead ${row.leadgenId} not found in ${row.sheetTab}`
      );
      continue;
    }

    let customData: Record<string, unknown> = {};
    try {
      customData = row.payloadJson ? JSON.parse(row.payloadJson) : {};
    } catch (err) {
      console.error(`bad payloadJson for ${row.leadgenId}:${row.eventName}:`, err);
      customData = {};
    }

    const phone = lead.phone ? normalizePhone(lead.phone) : undefined;
    const ok = await sendCAPIEvent({
      eventName: row.eventName,
      eventId: row.leadgenId,
      leadId: row.leadgenId,
      phone,
      customData,
      eventTime: row.eventTime,
    });

    if (ok) {
      await markConvDone(row.leadgenId, row.eventName);
    } else {
      const attempts = row.attempts + 1;
      const next = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      await markConvRetry(row.leadgenId, row.eventName, attempts, "send returned false", next);
      if (attempts >= CONV_MAX_ATTEMPTS) {
        await alert(
          `capi-conv-giveup:${row.leadgenId}:${row.eventName}`,
          `CAPI conversion gave up for lead ${row.leadgenId} event ${row.eventName} after ${attempts} tries`
        );
      }
    }
    convResults.push({ leadgenId: row.leadgenId, eventName: row.eventName, ok });
  }
```

- [ ] **Step 3: Extend the JSON response**

In `app/api/cron/capi-retry/route.ts`, change the final return (currently line 46) from:

```ts
  return NextResponse.json({ processed: results.length, results });
```

to:

```ts
  return NextResponse.json({
    processed: results.length,
    results,
    convProcessed: convResults.length,
    convResults,
  });
```

- [ ] **Step 4: Typecheck + full test run + lint**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: tsc exit 0; all jest suites PASS; lint clean.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/capi-retry/route.ts
git commit -m "feat(capi): cron second sweep retries conversions outbox"
```

---

## Task 6: delete dead `app/api/leads/qualify/route.ts`

**Files:**
- Delete: `app/api/leads/qualify/route.ts`

**Interfaces:** none — this route sets the invalid status `"qualified"` (not in `VALID_STATUSES`) and has no callers.

- [ ] **Step 1: Re-confirm there are no callers**

Run: `grep -rn "leads/qualify" --include="*.ts" --include="*.tsx" --include="*.js" . | grep -v node_modules`
Expected: only the route file itself (or nothing). If any OTHER file references it, STOP and report — do not delete.

- [ ] **Step 2: Delete the file**

```bash
git rm "app/api/leads/qualify/route.ts"
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: exit 0 (nothing imported the deleted route).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(capi): remove dead /api/leads/qualify route (invalid status, no callers)"
```

---

## Task 7: full verification gate

**Files:** none changed — this is the integration gate before review.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all suites PASS, including the two new ones (`capi-event-time`, `capi-conversions-pure`) and all pre-existing Phase 1 suites.

- [ ] **Step 2: Production build (typecheck + lint + compile)**

Run: `npm run build`
Expected: build succeeds. The `app/api/leads/qualify` route is gone from the route manifest; `app/api/leads/[row]` and `app/api/cron/capi-retry` compile.

- [ ] **Step 3: Confirm Phase 1 surface untouched**

Run: `git diff --name-only main` (or `git log --oneline -7`) and confirm the changed set is exactly: `lib/capi.ts`, `client.config.ts`, `lib/capi-conversions.ts`, `app/api/leads/[row]/route.ts`, `app/api/cron/capi-retry/route.ts`, `app/api/leads/qualify/route.ts` (deleted), and the two test files. `lib/capi-outbox.ts` and `app/api/webhooks/**` MUST NOT appear.

- [ ] **Step 4: Report ready for adversarial review** (do not deploy yet — Meta-side config in §Manual must land first; see below).

---

## Manual verification (post-merge, owner: Guy — not part of subagent execution)

Per `CLAUDE.md` (API/integration changes → deploy preview + send a test lead):

1. **Deploy preview**, then in the dashboard mark a real **test** lead `relevant`.
   - Expect a new row in `_capi_conversions_outbox`: `eventName=CompleteRegistration`, `status` flips `pending`→`done`.
   - Event appears in Events Manager (use the FB **test event code**) tied to `lead_id`.
2. **Force a send failure** (e.g. temporarily bad token) → row stays `pending` → hit the cron (`GET /api/cron/capi-retry` with `Authorization: Bearer $CRON_SECRET`) → row flips to `done`, `convProcessed >= 1`.
3. Mark a lead `accepted` → second row `eventName=Purchase`.
4. **Re-mark dedup:** take the lead from step 1 (already `done`) and mark it `not_relevant_target`. Expect **no new row, no status change** on the existing `CompleteRegistration` row (deduped no-op; inline send is skipped because `armed===false`; the corrected `content_name` is intentionally NOT re-sent — cosmetic, see §9.2). **Assert the lead's status field DID update to `not_relevant_target`** in the sheet (the status write runs before the CAPI block, so it must succeed regardless of the dedup no-op — a regression here would be silent).
5. **`failed`→re-arm:** manually set a conversion row's `status` to `failed` in the sheet, then re-mark that lead `relevant`. Expect the row to reset to `pending`/`attempts=0` and flip to `done` after the inline send.
6. **No-phone lead:** mark a lead that has a `leadId` but an empty phone `relevant`. Expect the event to still fire (Events Manager shows it tied to `lead_id`, `user_data` carries `lead_id` only). Confirm Meta accepts and attributes the lead_id-only event for the "שנת שירות" dataset.
7. Confirm **Phase 1 inbound Lead still works** — send a test FB lead; `_capi_outbox` still enqueues + the inbound sweep still flips it. (Regression check.)

## Meta-side dependencies (owner: Guy — gates real optimization, NOT code)

These do not block the code merge, but the feature is inert until they land:

1. **Confirm `FB_PIXEL_ID` in Vercel = `775454794700271`** ("שנת שירות").
2. **Lead-stage mapping (the crux):** Events Manager → "שנת שירות" → Conversion-Leads / lead funnel → map `capiEvents.qualified` (`CompleteRegistration`) to the **"qualified" stage**, and `capiEvents.accepted` (`Purchase`) to the converted stage. Until mapped, events are received + attributed by `lead_id` but **don't optimize** the `QUALITY_LEAD` ad set (`120240287649290446`).
3. If the actual qualified-stage event name differs, change `clientConfig.capiEvents.qualified` to match (no code change beyond config).

---

## Inherited risks (carried from Phase 1 by design — not introduced here)

- **Read-swallow:** `readAll()` returns `[]` on any Sheets read error (mirrors `capi-outbox.ts`). A *persistent* read failure of `_capi_conversions_outbox` would make the cron report `convProcessed: 0` with no alert — looks healthy while doing nothing. Identical to Phase 1's `_capi_outbox`; accepted for parity, flagged here so it's not a surprise.
- **Per-key write race:** `writeRow` is read-then-write, not atomic. The race is **per `(leadgenId, eventName)` key** — two different-key writes for one lead (`CompleteRegistration` + `Purchase`) are independent appends and don't collide (appends never shift existing rows, so `markDone`'s `idx+2` stays valid). The only race is two concurrent same-key `upsertPending` calls (e.g. double-click `relevant`), whose worst case is a duplicate `pending` row → the cron sends the same `event_id` twice → Meta dedups. Harmless. Same risk class as Phase 1 (which also writes one row per key).

## Self-Review (run against the spec)

**Spec coverage:**
- §3 separate `_capi_conversions_outbox` keyed by (leadgenId,eventName) → Task 3 ✅
- §4 enqueue→send→markDone, awaited → Task 4 ✅; cron second sweep reusing single `getLeads()` → Task 5 ✅
- §11 re-mark = "one deduped qualified event" → `upsertPending` returns `armed`; route sends inline only when armed, so the inline path and the cron-retry path agree and a same-stage re-mark is a true no-op (closes the review Blocker) ✅
- §5 leadId-empty guard → `resolveConversion` returns null (Task 3) + `&& lead.leadId` route gate (Task 4) ✅
- §6 config event names → Task 2 ✅
- §7 `eventTime` in `capi.ts` → Task 1 ✅
- §8 error handling: enqueue-fail logs+alerts, status still succeeds (Task 4 try/catch); send-fail stays pending; give-up alert at MAX (Task 5); feature-off/leadId-empty skip (Tasks 3,4); lead/tab missing at retry alerts+failed (Task 5) ✅
- §10 tests: pure mapping incl. leadId-empty + under_review/not_relevant → none, payloadJson round-trip, isDue, keyOf, eventTime honored → Tasks 1,3 ✅
- §12 retire `/qualify` → Task 6 ✅
- §13 phasing/order → reordered so config (Task 2) precedes the route (Task 4) that consumes it ✅

**Type consistency:** `markDone(leadgenId, eventName)` and `markRetry(leadgenId, eventName, …)` carry the eventName arg everywhere (Tasks 3,4,5). Route imports the conversions functions aliased (`upsertConvPending`, `markConvDone`); cron aliases them too (`readConvDue`, `markConvDone`, `markConvRetry`, `CONV_MAX_ATTEMPTS`) so they never collide with the Phase-1 `capi-outbox` names. `ResolvedConversion.customData` is `{ content_name; campaign_name? }`, assignable to `sendCAPIEvent`'s `Record<string, unknown>`.

**Placeholder scan:** none — every code step shows complete code.
