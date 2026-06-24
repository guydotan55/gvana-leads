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
