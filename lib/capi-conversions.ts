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

// CRM-source identification for Meta's Conversion-Leads funnel. Sent in
// custom_data so Meta recognizes the event as a CRM lead-stage update.
// `leadEventSource` should match the CRM name registered in Meta Leads Access
// (the page's "CRMs" tab — e.g. "Gavna_Leads"). Config-driven; an empty string
// omits the field. (Meta ignores unknown custom_data, so this is safe insurance —
// verify the exact field requirement against the live dataset's setup.)
export interface CapiCrm {
  eventSource: string;
  leadEventSource: string;
}

export interface ResolvedConversion {
  eventName: string;
  eventTime: number;
  customData: {
    content_name: string;
    campaign_name?: string;
    event_source?: string;
    lead_event_source?: string;
  };
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

// CRM-source custom_data that tags an event as a Conversion-Leads CRM event so
// Meta routes it into the lead-stage funnel (not website events). Empty config
// values are omitted. Used by BOTH the inbound `initial_lead` send and the
// qualified/converted conversions, so all three stages land in the same funnel.
export function crmFields(crm: CapiCrm): { event_source?: string; lead_event_source?: string } {
  const f: { event_source?: string; lead_event_source?: string } = {};
  if (crm.eventSource) f.event_source = crm.eventSource;
  if (crm.leadEventSource) f.lead_event_source = crm.leadEventSource;
  return f;
}

// Status → which CAPI conversion to fire. relevant & not_relevant_target are the
// SAME "qualified" stage (both = in our target audience). under_review,
// not_relevant, and any other status fire nothing. Organic/manual leads (empty
// leadId) are unattributable, so they fire nothing either.
export function resolveConversion(
  status: string,
  lead: { leadId: string; campaignName?: string },
  events: CapiEvents,
  crm: CapiCrm,
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

  // CRM-source fields ride in payloadJson too, so the cron replays them on retry.
  const customData: ResolvedConversion["customData"] = { content_name, ...crmFields(crm) };
  if (lead.campaignName) customData.campaign_name = lead.campaignName;
  return { eventName, eventTime: nowSec, customData };
}

// Pure arming decision for upsertPending: arm (write a pending row) for a fresh
// key or a `failed` row (re-arm); skip an existing `pending`/`done` row (a
// same-stage re-mark is a deduped no-op). Extracted so the decision is unit-tested
// without mocking the Sheet.
export function shouldArm(existing: ConvRow | undefined): boolean {
  return !existing || existing.status === "failed";
}

// Which rows the cron should send — at most ONE per (leadgenId, eventName) key.
// Two independent guards against a duplicate-append (two concurrent upserts for one
// key both observe no row and both append):
//  - suppress a due row whose key ALSO has a `done` row (the conversion already
//    completed — don't re-send, don't false-alarm a give-up);
//  - among the remaining due rows, collapse same-key duplicates to one, so the cron
//    sends a given conversion once per run even when NO `done` row exists yet
//    (otherwise both stray pendings would send, and we'd be leaning on Meta's dedup
//    window as the only guard — exactly the invisible-attribution risk to avoid).
// The leftover duplicate stays pending; once its sibling reaches `done`/`failed` the
// done-key suppression (or attempt cap) retires it. Applied ONLY here, never in
// writeRow's addressing read (which relies on array-index ↔ sheet-row alignment).
export function dueRows(rows: ConvRow[], nowISO: string): ConvRow[] {
  const doneKeys = new Set(
    rows.filter((r) => r.status === "done").map((r) => keyOf(r.leadgenId, r.eventName))
  );
  const seen = new Set<string>();
  const out: ConvRow[] = [];
  for (const r of rows) {
    if (!isDue(r, nowISO)) continue;
    const k = keyOf(r.leadgenId, r.eventName);
    if (doneKeys.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
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

// `snapshot` lets a caller that already read the table reuse it, avoiding a second
// readAll per write — halves the Sheet reads the cron does per row. The snapshot is
// the same read the caller's decision was made on, so the computed index is
// consistent. Appends never shift existing rows, so a stale-but-recent snapshot
// still addresses existing rows correctly.
async function writeRow(r: ConvRow, snapshot?: ConvRow[]): Promise<void> {
  await ensureTabWithHeader(TAB, HEADER);
  const sheets = getSheets();
  const all = snapshot ?? (await readAll());
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
  if (!shouldArm(existing)) return false;
  await writeRow(
    {
      leadgenId, eventName, sheetTab,
      status: "pending", attempts: 0, lastError: "", nextAttemptAt: "",
      eventTime: eventTimeSec, payloadJson,
    },
    all
  );
  return true;
}

export async function markDone(leadgenId: string, eventName: string): Promise<void> {
  const all = await readAll();
  const row = all.find((x) => x.leadgenId === leadgenId && x.eventName === eventName);
  if (!row) return;
  await writeRow({ ...row, status: "done" }, all);
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
  await writeRow({ ...row, status, attempts, lastError, nextAttemptAt: nextAttemptAtISO }, all);
}

export async function readDue(nowISO: string): Promise<ConvRow[]> {
  return dueRows(await readAll(), nowISO);
}

// Every conversion row. Exposed for the one-time backfill so it can skip keys
// already marked `done` (avoid re-sending) while still (re)sending no-row and
// `pending` keys. Normal flows use readDue.
export async function readAllConversions(): Promise<ConvRow[]> {
  return readAll();
}
