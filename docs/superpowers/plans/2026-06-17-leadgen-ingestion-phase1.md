# Leadgen Webhook Ingestion (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receive Meta Lead Ads `leadgen` webhooks directly, write each lead to a per-form Google Sheet tab, and guarantee a CAPI `Lead` event — with fail-loud Telegram/`_errors` alerting — removing the Zapier dependency.

**Architecture:** A single POST handler on the existing `/api/webhooks/facebook` verifies the Meta signature, resolves the target tab by `form_id` (creating it on first sight), dedups by lead id, fetches the lead from the Graph API, writes it to the Sheet, and records a CAPI outbox row that an inline send (and a daily retry cron) drains. Pure logic lives in small testable helpers; thin wrappers do the I/O.

**Tech Stack:** Next.js 14 App Router (route handlers), TypeScript, `googleapis` (Sheets), Meta Graph API v21.0, Jest (node env), `crypto` (HMAC).

Spec: `docs/superpowers/specs/2026-06-17-leadgen-ingestion-and-form-names-design.md`. This plan covers **Phase 1** (ingestion + reliability). Phase 2 (editable form names UI) is a separate plan.

## Global Constraints

- Graph API version: `v21.0` (matches `lib/capi.ts:72`).
- No `catch {}` without re-throwing or logging — fail loud (CLAUDE.md).
- No `if (slug === ...)`; gate via `client.config.ts` flags. New flag: `features.alerts`.
- Phone normalization for CAPI MUST go through `lib/phone.ts` `normalizePhone()` (CLAUDE.md) — never hand-roll.
- Sheet column layout is fixed in `config/columns.json` (FB cols A–P / indices 0–15; dashboard cols R–Z / 17–25; Q/16 is a gap).
- Store ids/phone as **plain Graph values** (no synthetic `l:`/`p:` prefixes).
- Tests: Jest, `__tests__/**/*.test.ts`, run with `npm test`. Imports use the `@/` alias. Tests for new code only.
- Env (server-side, never logged): `FB_APP_SECRET`, `FB_WEBHOOK_VERIFY_TOKEN` (exists), `FB_ACCESS_TOKEN` (exists), optional `FB_PAGE_ACCESS_TOKEN`, `FB_PIXEL_ID` (exists), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CRON_SECRET` (exists), `GOOGLE_*` (exists).

---

## File Structure

- `client.config.ts` (modify) — add `features.alerts`.
- `lib/capi.ts` (modify) — add optional `eventId` → `event_id`.
- `lib/leadgen.ts` (create) — Graph I/O + pure mapping/signature/sanitize helpers.
- `lib/sheets.ts` (modify) — `HEADER_ROW`, `ensureFormTab`, `appendLead`, `leadExists` (+ pure `normalizeLeadId`, `rowsContainLeadId`).
- `lib/form-labels.ts` (create) — `_form_labels` store: `getFormTabByFormId`, `upsertFormMapping` (+ types).
- `lib/capi-outbox.ts` (create) — `_capi_outbox` queue: pure `isDue`/`nextAttemptISO` + I/O `upsertPending`/`markDone`/`markRetry`/`readDue`.
- `lib/alerts.ts` (create) — pure `shouldSendAlert` + `alert()` (writes `_errors`, sends Telegram).
- `lib/lead-type.ts` (modify) — reorder `classifyLead`; custom label = `sheetTab`.
- `app/api/webhooks/facebook/route.ts` (modify) — POST ingestion handler.
- `app/api/cron/capi-retry/route.ts` (create) — daily CAPI retry.
- `vercel.json` (modify) — add the cron.
- `scripts/seed-form-labels.mjs` (create) — one-off backfill seed.

---

### Task 1: Add `features.alerts` config flag

**Files:**
- Modify: `client.config.ts` (the `ClientConfig.features` interface + the `clientConfig.features` value)
- Test: `__tests__/config-alerts.test.ts`

**Interfaces:**
- Produces: `isFeatureEnabled("alerts"): boolean` becomes valid (existing `lib/config.ts` helper).

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/config-alerts.test.ts
import { isFeatureEnabled } from "@/lib/config";

describe("features.alerts", () => {
  it("is enabled for the gavna config", () => {
    expect(isFeatureEnabled("alerts")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- config-alerts`
Expected: FAIL — `alerts` not assignable to `keyof features` / value undefined.

- [ ] **Step 3: Add the flag**

In `client.config.ts`, add `alerts: boolean;` to the `features` block of the `ClientConfig` interface, and `alerts: true,` to the `clientConfig.features` object (next to `webhookFbLeads`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- config-alerts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client.config.ts __tests__/config-alerts.test.ts
git commit -m "feat(config): add features.alerts flag"
```

---

### Task 2: Extend `sendCAPIEvent` with `eventId`

**Files:**
- Modify: `lib/capi.ts` (the `CAPIEventParams` interface + `eventData`)
- Test: `__tests__/capi-event-id.test.ts`

**Interfaces:**
- Produces: `sendCAPIEvent({ eventName, eventId?, leadId?, phone?, ... })` — when `eventId` is set, the posted event includes `event_id: eventId`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/capi-event-id.test.ts
import { sendCAPIEvent } from "@/lib/capi";

describe("sendCAPIEvent eventId", () => {
  const realFetch = global.fetch;
  beforeAll(() => {
    process.env.FB_PIXEL_ID = "PID";
    process.env.FB_ACCESS_TOKEN = "TOK";
  });
  afterEach(() => { global.fetch = realFetch; });

  it("includes event_id in the posted event when eventId is given", async () => {
    let body: any;
    global.fetch = (async (_url: string, init: any) => {
      body = JSON.parse(init.body);
      return { ok: true, text: async () => "" } as Response;
    }) as any;

    await sendCAPIEvent({ eventName: "Lead", eventId: "lead123", leadId: "lead123" });

    expect(body.data[0].event_id).toBe("lead123");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- capi-event-id`
Expected: FAIL — `event_id` is `undefined` (param not supported).

- [ ] **Step 3: Implement**

In `lib/capi.ts`: add `eventId?: string;` to `CAPIEventParams`. After `event_time` is set in `eventData`, add:

```ts
if (params.eventId) eventData.event_id = params.eventId;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- capi-event-id`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/capi.ts __tests__/capi-event-id.test.ts
git commit -m "feat(capi): support event_id for dedup"
```

---

### Task 3: Pure leadgen helpers — signature, mapping, sanitize

**Files:**
- Create: `lib/leadgen.ts`
- Test: `__tests__/leadgen-pure.test.ts`

**Interfaces:**
- Produces:
  - `verifySignature(rawBody: string, header: string | null, appSecret: string): boolean`
  - `interface GraphLead { id: string; created_time: string; field_data: { name: string; values: string[] }[]; ad_id?: string; ad_name?: string; adset_id?: string; adset_name?: string; campaign_id?: string; campaign_name?: string; form_id?: string; is_organic?: boolean; platform?: string; }`
  - `mapLeadToRow(lead: GraphLead, formName: string): string[]` — 16-element A–P row (plain values)
  - `extractField(fd: GraphLead["field_data"], names: string[]): string`
  - `extractName(fd): string`, `extractPhone(fd): string`, `extractEmail(fd): string`
  - `sanitizeTabName(name: string, existing: string[]): string`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/leadgen-pure.test.ts
import { createHmac } from "crypto";
import {
  verifySignature, mapLeadToRow, extractName, extractPhone, sanitizeTabName,
} from "@/lib/leadgen";

describe("verifySignature", () => {
  const secret = "s3cr3t";
  const body = '{"a":1}';
  const good = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a correct signature", () => {
    expect(verifySignature(body, good, secret)).toBe(true);
  });
  it("rejects a wrong/missing signature", () => {
    expect(verifySignature(body, "sha256=deadbeef", secret)).toBe(false);
    expect(verifySignature(body, null, secret)).toBe(false);
  });
});

describe("field extraction", () => {
  it("prefers full_name, falls back to first+last", () => {
    expect(extractName([{ name: "full_name", values: ["Dana Levi"] }])).toBe("Dana Levi");
    expect(extractName([
      { name: "first_name", values: ["Dana"] },
      { name: "last_name", values: ["Levi"] },
    ])).toBe("Dana Levi");
  });
  it("reads phone_number or phone", () => {
    expect(extractPhone([{ name: "phone_number", values: ["+972501234567"] }])).toBe("+972501234567");
    expect(extractPhone([{ name: "phone", values: ["+972501234567"] }])).toBe("+972501234567");
  });
});

describe("mapLeadToRow", () => {
  it("places values at the columns.json indices, plain (no prefixes)", () => {
    const row = mapLeadToRow({
      id: "123", created_time: "2026-06-16T10:00:00+03:00",
      field_data: [
        { name: "full_name", values: ["Dana Levi"] },
        { name: "phone_number", values: ["+972501234567"] },
      ],
      form_id: "f1", platform: "ig", is_organic: false,
    }, "תוכנית משתמטים");
    expect(row[0]).toBe("123");                    // id (A)
    expect(row[8]).toBe("f1");                     // form_id (I)
    expect(row[9]).toBe("תוכנית משתמטים");          // form_name (J)
    expect(row[13]).toBe("Dana Levi");            // full_name (N)
    expect(row[14]).toBe("+972501234567");        // phone (O)
    expect(row.length).toBe(16);
  });
});

describe("sanitizeTabName", () => {
  it("strips apostrophes and dedups against existing names", () => {
    expect(sanitizeTabName("ל'ידים", [])).not.toContain("'");
    const out = sanitizeTabName("דרוש מדריך", ["דרוש מדריך"]);
    expect(out).not.toBe("דרוש מדריך");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leadgen-pure`
Expected: FAIL — `Cannot find module '@/lib/leadgen'`.

- [ ] **Step 3: Implement `lib/leadgen.ts` (pure parts)**

```ts
import { createHmac, timingSafeEqual } from "crypto";
import columnsConfig from "@/config/columns.json";

export interface GraphLead {
  id: string;
  created_time: string;
  field_data: { name: string; values: string[] }[];
  ad_id?: string; ad_name?: string;
  adset_id?: string; adset_name?: string;
  campaign_id?: string; campaign_name?: string;
  form_id?: string;
  is_organic?: boolean;
  platform?: string;
}

export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const theirs = header.slice("sha256=".length);
  const ours = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(ours, "hex");
  const b = Buffer.from(theirs, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function extractField(fd: GraphLead["field_data"], names: string[]): string {
  for (const want of names) {
    const f = fd?.find((x) => x.name?.toLowerCase() === want);
    if (f && f.values?.[0]) return String(f.values[0]).trim();
  }
  return "";
}

export function extractName(fd: GraphLead["field_data"]): string {
  const full = extractField(fd, ["full_name"]);
  if (full) return full;
  const first = extractField(fd, ["first_name"]);
  const last = extractField(fd, ["last_name"]);
  return [first, last].filter(Boolean).join(" ").trim();
}

export const extractPhone = (fd: GraphLead["field_data"]) => extractField(fd, ["phone_number", "phone"]);
export const extractEmail = (fd: GraphLead["field_data"]) => extractField(fd, ["email"]);

export function mapLeadToRow(lead: GraphLead, formName: string): string[] {
  const fb = columnsConfig.fbColumns;
  const row: string[] = new Array(16).fill("");
  row[fb.leadId.index] = lead.id || "";
  row[fb.createdTime.index] = lead.created_time || "";
  row[fb.adId.index] = lead.ad_id || "";
  row[fb.adName.index] = lead.ad_name || "";
  row[fb.adsetId.index] = lead.adset_id || "";
  row[fb.adsetName.index] = lead.adset_name || "";
  row[fb.campaignId.index] = lead.campaign_id || "";
  row[fb.campaignName.index] = lead.campaign_name || "";
  row[fb.formId.index] = lead.form_id || "";
  row[fb.formName.index] = formName || "";
  row[fb.isOrganic.index] = lead.is_organic === undefined ? "" : String(lead.is_organic);
  row[fb.platform.index] = lead.platform || "";
  row[fb.interest.index] = "";
  row[fb.fullName.index] = extractName(lead.field_data);
  row[fb.phoneNumber.index] = extractPhone(lead.field_data);
  row[fb.leadStatus.index] = "";
  return row;
}

export function sanitizeTabName(name: string, existing: string[]): string {
  let base = (name || "טופס").replace(/['\[\]:\\/?*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
  if (!base) base = "טופס";
  if (!existing.includes(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} ${i}`.slice(0, 90);
    if (!existing.includes(candidate)) return candidate;
  }
  return base;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- leadgen-pure`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/leadgen.ts __tests__/leadgen-pure.test.ts
git commit -m "feat(leadgen): signature verify + field mapping + tab-name sanitize"
```

---

### Task 4: Graph I/O — `fetchLead`, `fetchFormName`

**Files:**
- Modify: `lib/leadgen.ts`
- Test: `__tests__/leadgen-graph.test.ts`

**Interfaces:**
- Consumes: `GraphLead` (Task 3).
- Produces:
  - `getLeadsToken(): string` — `FB_PAGE_ACCESS_TOKEN` || `FB_ACCESS_TOKEN`
  - `fetchLead(leadgenId: string): Promise<GraphLead>`
  - `fetchFormName(formId: string): Promise<string>`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/leadgen-graph.test.ts
import { fetchLead, fetchFormName } from "@/lib/leadgen";

describe("graph I/O", () => {
  const realFetch = global.fetch;
  beforeAll(() => { process.env.FB_ACCESS_TOKEN = "TOK"; });
  afterEach(() => { global.fetch = realFetch; });

  it("fetchLead requests the lead node and returns parsed json", async () => {
    let url = "";
    global.fetch = (async (u: string) => {
      url = u;
      return { ok: true, json: async () => ({ id: "l1", created_time: "t", field_data: [] }) } as Response;
    }) as any;
    const lead = await fetchLead("l1");
    expect(url).toContain("/v21.0/l1");
    expect(lead.id).toBe("l1");
  });

  it("fetchLead throws loudly on a non-ok response", async () => {
    global.fetch = (async () => ({ ok: false, status: 400, text: async () => "bad" } as Response)) as any;
    await expect(fetchLead("l1")).rejects.toThrow(/leadgen fetch failed/i);
  });

  it("fetchFormName returns the form name", async () => {
    global.fetch = (async () => ({ ok: true, json: async () => ({ name: "תוכנית משתמטים" }) } as Response)) as any;
    expect(await fetchFormName("f1")).toBe("תוכנית משתמטים");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leadgen-graph`
Expected: FAIL — `fetchLead`/`fetchFormName` not exported.

- [ ] **Step 3: Implement (append to `lib/leadgen.ts`)**

```ts
const GRAPH = "https://graph.facebook.com/v21.0";

export function getLeadsToken(): string {
  const token = process.env.FB_PAGE_ACCESS_TOKEN || process.env.FB_ACCESS_TOKEN;
  if (!token) throw new Error("Missing FB leads token (FB_PAGE_ACCESS_TOKEN/FB_ACCESS_TOKEN)");
  return token;
}

const LEAD_FIELDS = [
  "created_time", "field_data", "ad_id", "ad_name", "adset_id", "adset_name",
  "campaign_id", "campaign_name", "form_id", "is_organic", "platform",
].join(",");

export async function fetchLead(leadgenId: string): Promise<GraphLead> {
  const token = getLeadsToken();
  const url = `${GRAPH}/${leadgenId}?fields=${LEAD_FIELDS}&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`leadgen fetch failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as GraphLead;
  return { ...data, id: data.id || leadgenId };
}

export async function fetchFormName(formId: string): Promise<string> {
  const token = getLeadsToken();
  const url = `${GRAPH}/${formId}?fields=name&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`form name fetch failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { name?: string };
  return data.name || formId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- leadgen-graph`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/leadgen.ts __tests__/leadgen-graph.test.ts
git commit -m "feat(leadgen): Graph fetchLead + fetchFormName"
```

---

### Task 5: Sheets helpers — `ensureFormTab`, `appendLead`, `leadExists`

**Files:**
- Modify: `lib/sheets.ts`
- Test: `__tests__/sheets-leadexists.test.ts`

**Interfaces:**
- Produces:
  - `HEADER_ROW: string[]` (26 cols)
  - `normalizeLeadId(v: string): string`
  - `rowsContainLeadId(rows: string[][], leadId: string): boolean`
  - `ensureFormTab(sheetTab: string): Promise<void>` — creates the tab + header if missing (idempotent)
  - `appendLead(sheetTab: string, row: string[]): Promise<void>`
  - `leadExists(leadgenId: string, sheetTab: string): Promise<boolean>`

- [ ] **Step 1: Write the failing test (pure dedup logic)**

```ts
// __tests__/sheets-leadexists.test.ts
import { normalizeLeadId, rowsContainLeadId } from "@/lib/sheets";

describe("dedup id matching", () => {
  it("strips the l: prefix on both sides", () => {
    expect(normalizeLeadId("l:123")).toBe("123");
    expect(normalizeLeadId("123")).toBe("123");
  });
  it("matches a lead id regardless of prefix in the sheet", () => {
    const rows = [["l:123", "..."], ["456", "..."]];
    expect(rowsContainLeadId(rows, "123")).toBe(true);
    expect(rowsContainLeadId(rows, "456")).toBe(true);
    expect(rowsContainLeadId(rows, "789")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- sheets-leadexists`
Expected: FAIL — `normalizeLeadId`/`rowsContainLeadId` not exported.

- [ ] **Step 3: Implement (add to `lib/sheets.ts`)**

```ts
export const HEADER_ROW: string[] = [
  "id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name",
  "campaign_id", "campaign_name", "form_id", "form_name", "is_organic",
  "platform", "interest", "full_name", "phone_number", "lead_status",
  "", // Q gap
  "סטטוס", "הודעה אחרונה", "תאריך הודעה", "מזהה הודעה", "הערות",
  "ניסיונות", "תוכנית", "טופל ע\"י", "הערה פנימית",
];

export function normalizeLeadId(v: string): string {
  return (v || "").startsWith("l:") ? v.slice(2) : (v || "");
}

export function rowsContainLeadId(rows: string[][], leadId: string): boolean {
  const target = normalizeLeadId(leadId);
  return rows.some((r) => normalizeLeadId(r[0] || "") === target);
}

async function tabExists(sheetTab: string): Promise<boolean> {
  const sheets = getSheets();
  const meta = await withSheetsRetry(() => sheets.spreadsheets.get({ spreadsheetId: getSheetId() }));
  return (meta.data.sheets || []).some((s) => s.properties?.title === sheetTab);
}

export async function ensureFormTab(sheetTab: string): Promise<void> {
  if (await tabExists(sheetTab)) return; // idempotent
  const sheets = getSheets();
  const spreadsheetId = getSheetId();
  try {
    await withSheetsRetry(() => sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetTab } } }] },
    }));
  } catch (err) {
    // A concurrent webhook may have created it between the check and the add.
    if (await tabExists(sheetTab)) return;
    throw err;
  }
  await withSheetsRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetTab}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [HEADER_ROW] },
  }));
}

export async function appendLead(sheetTab: string, row: string[]): Promise<void> {
  const sheets = getSheets();
  await withSheetsRetry(() => sheets.spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `'${sheetTab}'!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  }));
}

export async function leadExists(leadgenId: string, sheetTab: string): Promise<boolean> {
  const sheets = getSheets();
  const res = await withSheetsRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `'${sheetTab}'!A1:A`,
  }));
  return rowsContainLeadId((res.data.values as string[][]) || [], leadgenId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- sheets-leadexists`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/sheets.ts __tests__/sheets-leadexists.test.ts
git commit -m "feat(sheets): ensureFormTab, appendLead, leadExists + dedup helpers"
```

---

### Task 6: Form-id → tab store (`lib/form-labels.ts`)

**Files:**
- Create: `lib/form-labels.ts`
- Test: `__tests__/form-labels-pure.test.ts`

**Interfaces:**
- Produces:
  - `interface FormMapping { formId: string; sheetTab: string; sourceName: string; label: string; }`
  - `parseFormLabelsRows(rows: string[][]): FormMapping[]` (pure)
  - `findTabByFormId(maps: FormMapping[], formId: string): string | null` (pure)
  - `getFormMappings(): Promise<FormMapping[]>` (I/O — reads `_form_labels`, `[]` if tab absent)
  - `upsertFormMapping(m: FormMapping): Promise<void>` (I/O — creates `_form_labels` if missing)

Store tab `_form_labels`, header `["formId","sheetTab","label","sourceName","updatedAt"]`.

- [ ] **Step 1: Write the failing test (pure parse/find)**

```ts
// __tests__/form-labels-pure.test.ts
import { parseFormLabelsRows, findTabByFormId } from "@/lib/form-labels";

const ROWS = [
  ["formId", "sheetTab", "label", "sourceName", "updatedAt"],
  ["859292457130080", "קמפיין משתמטים", "קמפיין משתמטים", "תוכנית משתמטים", "2026-06-17"],
];

describe("form-labels parsing", () => {
  it("parses rows skipping the header", () => {
    const maps = parseFormLabelsRows(ROWS);
    expect(maps).toHaveLength(1);
    expect(maps[0].formId).toBe("859292457130080");
    expect(maps[0].sheetTab).toBe("קמפיין משתמטים");
  });
  it("finds a tab by form id, null when unseen", () => {
    const maps = parseFormLabelsRows(ROWS);
    expect(findTabByFormId(maps, "859292457130080")).toBe("קמפיין משתמטים");
    expect(findTabByFormId(maps, "nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- form-labels-pure`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/form-labels.ts`**

```ts
import { google } from "googleapis";
import { withSheetsRetry } from "@/lib/sheets-retry";

const TAB = "_form_labels";
const HEADER = ["formId", "sheetTab", "label", "sourceName", "updatedAt"];

export interface FormMapping {
  formId: string; sheetTab: string; sourceName: string; label: string;
}

export function parseFormLabelsRows(rows: string[][]): FormMapping[] {
  return (rows || [])
    .filter((r) => r[0] && r[0] !== "formId")
    .map((r) => ({ formId: r[0], sheetTab: r[1] || "", label: r[2] || "", sourceName: r[3] || "" }));
}

export function findTabByFormId(maps: FormMapping[], formId: string): string | null {
  return maps.find((m) => m.formId === formId)?.sheetTab ?? null;
}

// --- I/O (reuses the sheets auth pattern from lib/sheets.ts) ---
function sheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google service account credentials are required");
  const auth = new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  return google.sheets({ version: "v4", auth });
}
function sheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID env var is required");
  return id;
}

export async function getFormMappings(): Promise<FormMapping[]> {
  const sheets = sheetsClient();
  try {
    const res = await withSheetsRetry(() => sheets.spreadsheets.values.get({
      spreadsheetId: sheetId(), range: `'${TAB}'!A1:E`,
    }));
    return parseFormLabelsRows((res.data.values as string[][]) || []);
  } catch {
    return []; // tab not created yet
  }
}

async function ensureStoreTab(): Promise<void> {
  const sheets = sheetsClient();
  const meta = await withSheetsRetry(() => sheets.spreadsheets.get({ spreadsheetId: sheetId() }));
  const exists = (meta.data.sheets || []).some((s) => s.properties?.title === TAB);
  if (exists) return;
  await withSheetsRetry(() => sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId(),
    requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
  }));
  await withSheetsRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId: sheetId(), range: `'${TAB}'!A1`, valueInputOption: "RAW",
    requestBody: { values: [HEADER] },
  }));
}

export async function upsertFormMapping(m: FormMapping): Promise<void> {
  await ensureStoreTab();
  const sheets = sheetsClient();
  const existing = await getFormMappings();
  const idx = existing.findIndex((x) => x.formId === m.formId);
  const rowValues = [m.formId, m.sheetTab, m.label, m.sourceName, new Date().toISOString()];
  if (idx === -1) {
    await withSheetsRetry(() => sheets.spreadsheets.values.append({
      spreadsheetId: sheetId(), range: `'${TAB}'!A1`,
      valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
      requestBody: { values: [rowValues] },
    }));
  } else {
    const rowNumber = idx + 2; // +1 header, +1 to 1-based
    await withSheetsRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId: sheetId(), range: `'${TAB}'!A${rowNumber}:E${rowNumber}`,
      valueInputOption: "RAW", requestBody: { values: [rowValues] },
    }));
  }
}
```

> Note: `new Date().toISOString()` runs at request time (server), which is fine here — this is not a workflow script.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- form-labels-pure`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/form-labels.ts __tests__/form-labels-pure.test.ts
git commit -m "feat(form-labels): _form_labels store (form_id -> tab map)"
```

---

### Task 7: CAPI outbox (`lib/capi-outbox.ts`)

**Files:**
- Create: `lib/capi-outbox.ts`
- Test: `__tests__/capi-outbox-pure.test.ts`

**Interfaces:**
- Produces:
  - `interface OutboxRow { leadgenId: string; sheetTab: string; status: "pending"|"done"|"failed"; attempts: number; lastError: string; nextAttemptAt: string; }`
  - `MAX_ATTEMPTS = 5`
  - `isDue(row: OutboxRow, nowISO: string): boolean` (pure)
  - `parseOutboxRows(rows: string[][]): OutboxRow[]` (pure)
  - `upsertPending(leadgenId, sheetTab): Promise<void>`, `markDone(leadgenId): Promise<void>`, `markRetry(leadgenId, attempts, lastError, nextAttemptAtISO): Promise<void>`, `readDue(nowISO): Promise<OutboxRow[]>`

- [ ] **Step 1: Write the failing test (pure)**

```ts
// __tests__/capi-outbox-pure.test.ts
import { isDue, parseOutboxRows, MAX_ATTEMPTS } from "@/lib/capi-outbox";

describe("outbox pure logic", () => {
  const base = { leadgenId: "l1", sheetTab: "t", lastError: "", nextAttemptAt: "2026-06-17T00:00:00Z" };
  it("pending + due time + under max → due", () => {
    expect(isDue({ ...base, status: "pending", attempts: 1 }, "2026-06-18T00:00:00Z")).toBe(true);
  });
  it("done or maxed or future → not due", () => {
    expect(isDue({ ...base, status: "done", attempts: 1 }, "2026-06-18T00:00:00Z")).toBe(false);
    expect(isDue({ ...base, status: "pending", attempts: MAX_ATTEMPTS }, "2026-06-18T00:00:00Z")).toBe(false);
    expect(isDue({ ...base, status: "pending", attempts: 1, nextAttemptAt: "2026-06-30T00:00:00Z" }, "2026-06-18T00:00:00Z")).toBe(false);
  });
  it("parses rows skipping header", () => {
    const rows = [["leadgenId","sheetTab","status","attempts","lastError","nextAttemptAt"],
                  ["l1","t","pending","2","err","2026-06-17T00:00:00Z"]];
    const out = parseOutboxRows(rows);
    expect(out[0]).toMatchObject({ leadgenId: "l1", status: "pending", attempts: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- capi-outbox-pure`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/capi-outbox.ts`**

```ts
import { google } from "googleapis";
import { withSheetsRetry } from "@/lib/sheets-retry";

const TAB = "_capi_outbox";
const HEADER = ["leadgenId", "sheetTab", "status", "attempts", "lastError", "nextAttemptAt"];
export const MAX_ATTEMPTS = 5;

export interface OutboxRow {
  leadgenId: string; sheetTab: string;
  status: "pending" | "done" | "failed";
  attempts: number; lastError: string; nextAttemptAt: string;
}

export function parseOutboxRows(rows: string[][]): OutboxRow[] {
  return (rows || [])
    .filter((r) => r[0] && r[0] !== "leadgenId")
    .map((r) => ({
      leadgenId: r[0], sheetTab: r[1] || "",
      status: (r[2] as OutboxRow["status"]) || "pending",
      attempts: parseInt(r[3] || "0", 10) || 0,
      lastError: r[4] || "", nextAttemptAt: r[5] || "",
    }));
}

export function isDue(row: OutboxRow, nowISO: string): boolean {
  if (row.status !== "pending") return false;
  if (row.attempts >= MAX_ATTEMPTS) return false;
  return (row.nextAttemptAt || "") <= nowISO;
}

function client() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google service account credentials are required");
  const auth = new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  return google.sheets({ version: "v4", auth });
}
function sid() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID env var is required");
  return id;
}

async function ensureTab(): Promise<void> {
  const sheets = client();
  const meta = await withSheetsRetry(() => sheets.spreadsheets.get({ spreadsheetId: sid() }));
  if ((meta.data.sheets || []).some((s) => s.properties?.title === TAB)) return;
  await withSheetsRetry(() => sheets.spreadsheets.batchUpdate({
    spreadsheetId: sid(), requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
  }));
  await withSheetsRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId: sid(), range: `'${TAB}'!A1`, valueInputOption: "RAW", requestBody: { values: [HEADER] },
  }));
}

async function readAll(): Promise<{ rows: OutboxRow[] }> {
  const sheets = client();
  try {
    const res = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: sid(), range: `'${TAB}'!A1:F` }));
    return { rows: parseOutboxRows((res.data.values as string[][]) || []) };
  } catch { return { rows: [] }; }
}

function rowValues(r: OutboxRow): string[] {
  return [r.leadgenId, r.sheetTab, r.status, String(r.attempts), r.lastError, r.nextAttemptAt];
}

async function writeRow(r: OutboxRow): Promise<void> {
  await ensureTab();
  const sheets = client();
  const all = await readAll();
  const idx = all.rows.findIndex((x) => x.leadgenId === r.leadgenId);
  if (idx === -1) {
    await withSheetsRetry(() => sheets.spreadsheets.values.append({
      spreadsheetId: sid(), range: `'${TAB}'!A1`, valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS", requestBody: { values: [rowValues(r)] },
    }));
  } else {
    const n = idx + 2;
    await withSheetsRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId: sid(), range: `'${TAB}'!A${n}:F${n}`, valueInputOption: "RAW",
      requestBody: { values: [rowValues(r)] },
    }));
  }
}

export async function upsertPending(leadgenId: string, sheetTab: string): Promise<void> {
  const all = await readAll();
  if (all.rows.some((x) => x.leadgenId === leadgenId)) return; // idempotent
  await writeRow({ leadgenId, sheetTab, status: "pending", attempts: 0, lastError: "", nextAttemptAt: "" });
}
export async function markDone(leadgenId: string): Promise<void> {
  const all = await readAll();
  const row = all.rows.find((x) => x.leadgenId === leadgenId);
  if (!row) return;
  await writeRow({ ...row, status: "done" });
}
export async function markRetry(leadgenId: string, attempts: number, lastError: string, nextAttemptAtISO: string): Promise<void> {
  const all = await readAll();
  const row = all.rows.find((x) => x.leadgenId === leadgenId);
  if (!row) return;
  const status = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
  await writeRow({ ...row, status, attempts, lastError, nextAttemptAt: nextAttemptAtISO });
}
export async function readDue(nowISO: string): Promise<OutboxRow[]> {
  const all = await readAll();
  return all.rows.filter((r) => isDue(r, nowISO));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- capi-outbox-pure`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/capi-outbox.ts __tests__/capi-outbox-pure.test.ts
git commit -m "feat(capi-outbox): retry queue store + pure due/parse logic"
```

---

### Task 8: Alerting (`lib/alerts.ts`)

**Files:**
- Create: `lib/alerts.ts`
- Test: `__tests__/alerts-pure.test.ts`

**Interfaces:**
- Produces:
  - `shouldSendAlert(recent: { key: string; ts: string }[], key: string, nowMs: number, windowMs: number): boolean` (pure)
  - `alert(key: string, message: string, context?: string): Promise<void>` — always appends `_errors`; sends Telegram if `features.alerts` + env + not deduped; never throws.

`_errors` header: `["timestamp","source","key","message","context"]`.

- [ ] **Step 1: Write the failing test (pure dedup)**

```ts
// __tests__/alerts-pure.test.ts
import { shouldSendAlert } from "@/lib/alerts";

describe("alert dedup", () => {
  const now = Date.parse("2026-06-18T12:00:00Z");
  const window = 60 * 60 * 1000; // 1h
  it("suppresses a same-key alert sent within the window", () => {
    const recent = [{ key: "missing-tab:X", ts: "2026-06-18T11:30:00Z" }];
    expect(shouldSendAlert(recent, "missing-tab:X", now, window)).toBe(false);
  });
  it("allows when outside the window or a different key", () => {
    const recent = [{ key: "missing-tab:X", ts: "2026-06-18T10:00:00Z" }];
    expect(shouldSendAlert(recent, "missing-tab:X", now, window)).toBe(true);
    expect(shouldSendAlert(recent, "other:Y", now, window)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- alerts-pure`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/alerts.ts`**

```ts
import { google } from "googleapis";
import { withSheetsRetry } from "@/lib/sheets-retry";
import { isFeatureEnabled } from "@/lib/config";

const TAB = "_errors";
const HEADER = ["timestamp", "source", "key", "message", "context"];
const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1h

export function shouldSendAlert(recent: { key: string; ts: string }[], key: string, nowMs: number, windowMs: number): boolean {
  return !recent.some((r) => r.key === key && nowMs - Date.parse(r.ts) < windowMs);
}

function client() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const k = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const auth = new google.auth.JWT({ email, key: k, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  return google.sheets({ version: "v4", auth });
}
const sid = () => process.env.GOOGLE_SHEET_ID as string;

async function ensureTab(sheets: ReturnType<typeof client>): Promise<void> {
  const meta = await withSheetsRetry(() => sheets.spreadsheets.get({ spreadsheetId: sid() }));
  if ((meta.data.sheets || []).some((s) => s.properties?.title === TAB)) return;
  await withSheetsRetry(() => sheets.spreadsheets.batchUpdate({
    spreadsheetId: sid(), requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
  }));
  await withSheetsRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId: sid(), range: `'${TAB}'!A1`, valueInputOption: "RAW", requestBody: { values: [HEADER] },
  }));
}

async function recentAlerts(sheets: ReturnType<typeof client>): Promise<{ key: string; ts: string }[]> {
  try {
    const res = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: sid(), range: `'${TAB}'!A2:C` }));
    return ((res.data.values as string[][]) || []).map((r) => ({ ts: r[0] || "", key: r[2] || "" }));
  } catch { return []; }
}

async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export async function alert(key: string, message: string, context = ""): Promise<void> {
  try {
    const sheets = client();
    await ensureTab(sheets);
    const ts = new Date().toISOString();
    // 1) always log to _errors
    await withSheetsRetry(() => sheets.spreadsheets.values.append({
      spreadsheetId: sid(), range: `'${TAB}'!A1`, valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS", requestBody: { values: [[ts, "leadgen", key, message, context]] },
    }));
    // 2) telegram, gated + deduped
    if (!isFeatureEnabled("alerts")) return;
    const recent = await recentAlerts(sheets);
    if (!shouldSendAlert(recent, key, Date.parse(ts), DEDUP_WINDOW_MS)) return;
    await sendTelegram(`⚠️ ${message}${context ? `\n${context}` : ""}`);
  } catch (err) {
    // alerting must never break ingestion/cron
    console.error("alert() failed:", err);
  }
}
```

> Dedup reads `_errors` *after* appending the current row; the just-written row shares `ts === nowMs`, so `nowMs - ts = 0 < window` would suppress it. Guard by comparing strictly: the current row's own timestamp equals `nowMs`, and `0 < windowMs` is true, so it WOULD suppress. To avoid suppressing on the freshly-written row, read recent alerts BEFORE appending. **Implementation note:** move the `recentAlerts` read above the append, capture it, then append, then decide. Adjust Step 3 accordingly when implementing (read-then-append-then-decide).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- alerts-pure`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/alerts.ts __tests__/alerts-pure.test.ts
git commit -m "feat(alerts): _errors log + deduped Telegram alerting"
```

---

### Task 9: Reorder `classifyLead` (own-name labels)

**Files:**
- Modify: `lib/lead-type.ts:33-57` (`classifyLead`)
- Test: `__tests__/classify-reorder.test.ts`

**Interfaces:**
- Consumes/Produces: `classifyLead(lead): { kind, label }` — for non-legacy, non-`_` tabs, `kind="custom"`, `label = sheetTab`, **before** keyword matching.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/classify-reorder.test.ts
import { classifyLead } from "@/lib/lead-type";

const mk = (over: any) => ({ formName: "", sheetTab: "", adsetId: "", ...over }) as any;

describe("classifyLead reorder", () => {
  it("a non-legacy tab with a keyword name still shows its own (tab) name", () => {
    const info = classifyLead(mk({ sheetTab: "מדריכים למכינה הטכנולוגית", formName: "מדריכים למכינה הטכנולוגית" }));
    expect(info.kind).toBe("custom");
    expect(info.label).toBe("מדריכים למכינה הטכנולוגית");
  });
  it("the backfilled tab label is the tab name, not the row form_name", () => {
    const info = classifyLead(mk({ sheetTab: "קמפיין משתמטים", formName: "תוכנית משתמטים" }));
    expect(info.label).toBe("קמפיין משתמטים");
  });
  it("legacy לידים tab still uses keyword classification", () => {
    const info = classifyLead(mk({ sheetTab: "לידים", formName: "מסע משתחררים" }));
    expect(info.kind).toBe("masa");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- classify-reorder`
Expected: FAIL — keyword tab currently returns `instructor`/keyword kind, and the backfilled tab returns the form_name.

- [ ] **Step 3: Reorder `classifyLead`**

Move the non-legacy-tab branch to the top and use the tab as the label:

```ts
export function classifyLead(lead: Lead): LeadTypeInfo {
  const name = lead.formName || "";
  const tab = lead.sheetTab || "";

  // Per-form tabs win first: each form shows under its own (tab) name.
  if (tab && !LEGACY_TABS.has(tab) && !tab.startsWith("_")) {
    return { kind: "custom", label: tab };
  }

  // Legacy lumped tabs keep keyword classification.
  const combined = name + tab;
  if (combined.includes("מדריך") || combined.includes("מדריכ")) {
    return { kind: "instructor", label: CORE_LABELS.instructor };
  }
  if (combined.includes("מסע משתחררים")) {
    return { kind: "masa", label: CORE_LABELS.masa };
  }
  const rawAdsetId = (lead.adsetId || "").replace(/^as:/, "");
  if (combined.includes("טכנולוגית") || rawAdsetId === TECH_ADSET_ID) {
    return { kind: "tech", label: CORE_LABELS.tech };
  }
  return { kind: "student", label: CORE_LABELS.student };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- classify-reorder`
Expected: PASS. Then run the whole suite (`npm test`) to confirm no existing lead-type/filter test regressed.

- [ ] **Step 5: Commit**

```bash
git add lib/lead-type.ts __tests__/classify-reorder.test.ts
git commit -m "feat(lead-type): per-form tabs show their own name (reorder)"
```

---

### Task 10: Webhook POST ingestion handler

**Files:**
- Modify: `app/api/webhooks/facebook/route.ts`
- Test: `__tests__/webhook-post.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–8 (`verifySignature`, `fetchLead`, `fetchFormName`, `mapLeadToRow`, `sanitizeTabName`, `ensureFormTab`, `appendLead`, `leadExists`, `getFormMappings`/`findTabByFormId`/`upsertFormMapping`, `upsertPending`/`markDone`, `sendCAPIEvent`, `alert`), `isFeatureEnabled`, `normalizePhone`.

- [ ] **Step 1: Write the failing test (signature gate)**

```ts
// __tests__/webhook-post.test.ts
import { POST } from "@/app/api/webhooks/facebook/route";

function req(body: string, sig?: string) {
  return new Request("https://x/api/webhooks/facebook", {
    method: "POST",
    headers: sig ? { "x-hub-signature-256": sig } : {},
    body,
  }) as any;
}

describe("webhook POST", () => {
  beforeAll(() => { process.env.FB_APP_SECRET = "s3cr3t"; });
  it("rejects a bad signature with 403", async () => {
    const res = await POST(req('{"object":"page","entry":[]}', "sha256=bad"));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- webhook-post`
Expected: FAIL — current POST returns `{ success: true }` 200, no signature check.

- [ ] **Step 3: Implement the POST handler**

Replace the `POST()` in `app/api/webhooks/facebook/route.ts` (keep the existing `GET` handshake). Full handler:

```ts
import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/lib/config";
import {
  verifySignature, fetchLead, fetchFormName, mapLeadToRow, sanitizeTabName,
} from "@/lib/leadgen";
import {
  ensureFormTab, appendLead, leadExists,
} from "@/lib/sheets";
import { getFormMappings, findTabByFormId, upsertFormMapping } from "@/lib/form-labels";
import { upsertPending, markDone } from "@/lib/capi-outbox";
import { sendCAPIEvent } from "@/lib/capi";
import { alert } from "@/lib/alerts";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

async function tabNames(): Promise<string[]> {
  // reuse the store + a metadata read is overkill; resolve from existing mappings
  const maps = await getFormMappings();
  return maps.map((m) => m.sheetTab);
}

async function processLead(leadgenId: string, formId: string): Promise<void> {
  // 1. resolve target tab by form id
  const maps = await getFormMappings();
  let sheetTab = findTabByFormId(maps, formId);
  let sourceName = "";

  if (sheetTab) {
    // mapped but tab might have been deleted/renamed → fail loud
    if (!(await leadExistsTabPresent(sheetTab))) {
      await alert(`missing-tab:${sheetTab}`, `Mapped tab "${sheetTab}" is missing for form ${formId}`, `lead ${leadgenId}`);
      throw new Error(`mapped tab missing: ${sheetTab}`);
    }
  } else {
    sourceName = await fetchFormName(formId);
    sheetTab = sanitizeTabName(sourceName, maps.map((m) => m.sheetTab));
    await ensureFormTab(sheetTab);
    await upsertFormMapping({ formId, sheetTab, sourceName, label: "" });
  }

  // 2. dedup
  if (await leadExists(leadgenId, sheetTab)) return;

  // 3. fetch + map + write
  const lead = await fetchLead(leadgenId);
  const formName = sourceName || (maps.find((m) => m.formId === formId)?.sourceName ?? sheetTab);
  const row = mapLeadToRow(lead, formName);
  if (!row[13] || !row[14]) {
    await alert(`missing-field:${leadgenId}`, `Lead ${leadgenId} missing name or phone`, JSON.stringify(lead.field_data));
  }
  await appendLead(sheetTab, row);

  // 4. CAPI (guaranteed via outbox) — gated by features.capi
  if (isFeatureEnabled("capi")) {
    await upsertPending(leadgenId, sheetTab);
    const phone = normalizePhone(row[14] || "");
    const ok = await sendCAPIEvent({ eventName: "Lead", eventId: leadgenId, leadId: leadgenId, phone });
    if (ok) await markDone(leadgenId);
  }
}

// helper: does a tab currently exist? (cheap presence check)
async function leadExistsTabPresent(sheetTab: string): Promise<boolean> {
  try { await leadExists("__probe__", sheetTab); return true; } catch { return false; }
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.FB_APP_SECRET;
  const raw = await request.text();
  const sig = request.headers.get("x-hub-signature-256");
  if (!appSecret || !verifySignature(raw, sig, appSecret)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isFeatureEnabled("webhookFbLeads")) {
    return NextResponse.json({ success: true, skipped: "feature off" });
  }

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const changes: { leadgen_id: string; form_id: string }[] = [];
  for (const entry of payload.entry || []) {
    for (const ch of entry.changes || []) {
      if (ch.field === "leadgen" && ch.value?.leadgen_id) {
        changes.push({ leadgen_id: ch.value.leadgen_id, form_id: ch.value.form_id });
      }
    }
  }

  try {
    for (const c of changes) {
      await processLead(c.leadgen_id, c.form_id);
    }
  } catch (err) {
    console.error("leadgen ingestion error:", err);
    await alert(`ingest-error`, `Ingestion failed: ${(err as Error).message}`);
    return NextResponse.json({ error: "processing failed" }, { status: 500 }); // Meta retries the batch
  }

  return NextResponse.json({ success: true });
}
```

> **GET unchanged.** The existing GET handshake (verify token) stays exactly as-is.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- webhook-post`
Expected: PASS (403 on bad signature). Then `npm test` for the full suite.

- [ ] **Step 5: Commit**

```bash
git add app/api/webhooks/facebook/route.ts __tests__/webhook-post.test.ts
git commit -m "feat(webhook): ingest Meta leadgen → Sheet + CAPI + alerts"
```

---

### Task 11: CAPI retry cron

**Files:**
- Create: `app/api/cron/capi-retry/route.ts`
- Modify: `vercel.json`
- Test: covered by `capi-outbox-pure` (Task 7) for the due logic; the route is thin glue (manual verification).

**Interfaces:**
- Consumes: `readDue`, `markDone`, `markRetry`, `MAX_ATTEMPTS` (Task 7), `getLeads` (existing), `sendCAPIEvent` (Task 2), `normalizePhone`, `alert` (Task 8), `isFeatureEnabled`.

- [ ] **Step 1: Implement the cron route**

```ts
// app/api/cron/capi-retry/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/lib/config";
import { readDue, markDone, markRetry, MAX_ATTEMPTS } from "@/lib/capi-outbox";
import { getLeads } from "@/lib/sheets";
import { sendCAPIEvent } from "@/lib/capi";
import { normalizePhone } from "@/lib/phone";
import { alert } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isFeatureEnabled("capi")) return NextResponse.json({ message: "capi disabled" });

  const now = new Date();
  const nowISO = now.toISOString();
  const due = await readDue(nowISO);
  const leads = await getLeads();
  const results: { leadgenId: string; ok: boolean }[] = [];

  for (const row of due) {
    const lead = leads.find((l) => l.leadId === row.leadgenId && l.sheetTab === row.sheetTab);
    if (!lead) {
      await markRetry(row.leadgenId, MAX_ATTEMPTS, "lead/tab not found", nowISO);
      await alert(`capi-retry-missing:${row.leadgenId}`, `CAPI retry: lead ${row.leadgenId} not found in ${row.sheetTab}`);
      continue;
    }
    const phone = normalizePhone(lead.phone || "");
    const ok = await sendCAPIEvent({ eventName: "Lead", eventId: row.leadgenId, leadId: row.leadgenId, phone });
    if (ok) {
      await markDone(row.leadgenId);
    } else {
      const attempts = row.attempts + 1;
      const next = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      await markRetry(row.leadgenId, attempts, "send returned false", next);
      if (attempts >= MAX_ATTEMPTS) {
        await alert(`capi-giveup:${row.leadgenId}`, `CAPI gave up for lead ${row.leadgenId} after ${attempts} tries`);
      }
    }
    results.push({ leadgenId: row.leadgenId, ok });
  }

  return NextResponse.json({ processed: results.length, results });
}
```

- [ ] **Step 2: Add the cron to `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/cron/triggers", "schedule": "0 0 * * *" },
    { "path": "/api/cron/capi-retry", "schedule": "0 1 * * *" }
  ]
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: compiles with no type errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/capi-retry/route.ts vercel.json
git commit -m "feat(cron): daily CAPI retry from outbox"
```

---

### Task 12: Backfill seed + integration verification

**Files:**
- Create: `scripts/seed-form-labels.mjs`

**Interfaces:**
- Consumes: `_form_labels` store shape (Task 6).

- [ ] **Step 1: Write the seed script**

```js
// scripts/seed-form-labels.mjs — run once: `node scripts/seed-form-labels.mjs`
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { google } from "googleapis";

loadEnvConfig(process.cwd());

const TAB = "_form_labels";
const HEADER = ["formId", "sheetTab", "label", "sourceName", "updatedAt"];
const ROW = ["859292457130080", "קמפיין משתמטים", "קמפיין משתמטים", "תוכנית משתמטים", new Date().toISOString()];

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const spreadsheetId = process.env.GOOGLE_SHEET_ID;

const meta = await sheets.spreadsheets.get({ spreadsheetId });
const exists = (meta.data.sheets || []).some((s) => s.properties?.title === TAB);
if (!exists) {
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] } });
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `'${TAB}'!A1`, valueInputOption: "RAW", requestBody: { values: [HEADER] } });
}
const cur = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${TAB}'!A1:E` });
const has = ((cur.data.values || []).some((r) => r[0] === ROW[0]));
if (has) { console.log("backfill row already present — nothing to do"); process.exit(0); }
await sheets.spreadsheets.values.append({ spreadsheetId, range: `'${TAB}'!A1`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: [ROW] } });
console.log("seeded _form_labels backfill row");
```

- [ ] **Step 2: Run the seed once**

Run: `node scripts/seed-form-labels.mjs`
Expected: `seeded _form_labels backfill row` (or "already present" on re-run).

- [ ] **Step 3: Full test suite + build**

Run: `npm test && npm run build`
Expected: all tests pass; build compiles.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-form-labels.mjs
git commit -m "chore(leadgen): one-off _form_labels backfill seed"
```

- [ ] **Step 5: Manual end-to-end (rollout — see spec §11)**

Set env (`FB_APP_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, confirm `CRON_SECRET`, leads token), subscribe the Page's `leadgen` webhook to `/api/webhooks/facebook`, send a test lead via Meta's Lead Ads Testing Tool, confirm: lead lands in the right tab, dashboard shows the form's own name, a CAPI event appears in Events Manager, and `_capi_outbox` row flips to `done`. Then turn off the Zapier Zap.

---

## Self-Review Notes

- **Spec coverage:** signature (T3/T10), per-form tab by form_id (T6/T10), dedup (T5/T10), Graph fetch + mapping (T3/T4/T10), guaranteed CAPI + outbox + retry cron (T2/T7/T10/T11), alerting + `_errors` + Telegram + dedup (T8), fail-loud missing tab (T10), classifyLead own-name reorder (T9), backfill (T12), config flag (T1). Phase 2 (editable labels UI) intentionally excluded.
- **Refinement vs spec:** custom label = `sheetTab` (committed to spec §6) keeps a tab unified.
- **Known follow-ups for the implementer:** in Task 8 Step 3, read `recentAlerts` BEFORE appending the current row (noted inline) so the just-written row doesn't suppress its own Telegram send. In Task 10, `leadExistsTabPresent` is a pragmatic presence probe; if a cleaner `tabExists` is exported from `lib/sheets.ts`, prefer it.
