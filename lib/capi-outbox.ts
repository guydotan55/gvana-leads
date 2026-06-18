import { getSheets, getSheetId, ensureTabWithHeader } from "@/lib/sheets";
import { withSheetsRetry } from "@/lib/sheets-retry";

const TAB = "_capi_outbox";
const HEADER = ["leadgenId", "sheetTab", "status", "attempts", "lastError", "nextAttemptAt"];
export const MAX_ATTEMPTS = 5;

export interface OutboxRow {
  leadgenId: string;
  sheetTab: string;
  status: "pending" | "done" | "failed";
  attempts: number;
  lastError: string;
  nextAttemptAt: string;
}

export function parseOutboxRows(rows: string[][]): OutboxRow[] {
  return (rows || [])
    .filter((r) => r[0] && r[0] !== "leadgenId")
    .map((r) => ({
      leadgenId: r[0],
      sheetTab: r[1] || "",
      status: (r[2] as OutboxRow["status"]) || "pending",
      attempts: parseInt(r[3] || "0", 10) || 0,
      lastError: r[4] || "",
      nextAttemptAt: r[5] || "",
    }));
}

export function isDue(row: OutboxRow, nowISO: string): boolean {
  if (row.status !== "pending") return false;
  if (row.attempts >= MAX_ATTEMPTS) return false;
  return (row.nextAttemptAt || "") <= nowISO;
}

async function readAll(): Promise<OutboxRow[]> {
  try {
    const sheets = getSheets();
    const res = await withSheetsRetry(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId: getSheetId(),
        range: `'${TAB}'!A1:F`,
      })
    );
    return parseOutboxRows((res.data.values as string[][]) || []);
  } catch {
    return [];
  }
}

function rowValues(r: OutboxRow): string[] {
  return [r.leadgenId, r.sheetTab, r.status, String(r.attempts), r.lastError, r.nextAttemptAt];
}

async function writeRow(r: OutboxRow): Promise<void> {
  await ensureTabWithHeader(TAB, HEADER);
  const sheets = getSheets();
  const all = await readAll();
  const idx = all.findIndex((x) => x.leadgenId === r.leadgenId);
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
        range: `'${TAB}'!A${n}:F${n}`,
        valueInputOption: "RAW",
        requestBody: { values: [rowValues(r)] },
      })
    );
  }
}

export async function upsertPending(leadgenId: string, sheetTab: string): Promise<void> {
  const all = await readAll();
  if (all.some((x) => x.leadgenId === leadgenId)) return; // idempotent
  await writeRow({ leadgenId, sheetTab, status: "pending", attempts: 0, lastError: "", nextAttemptAt: "" });
}

export async function markDone(leadgenId: string): Promise<void> {
  const all = await readAll();
  const row = all.find((x) => x.leadgenId === leadgenId);
  if (!row) return;
  await writeRow({ ...row, status: "done" });
}

export async function markRetry(leadgenId: string, attempts: number, lastError: string, nextAttemptAtISO: string): Promise<void> {
  const all = await readAll();
  const row = all.find((x) => x.leadgenId === leadgenId);
  if (!row) return;
  const status = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
  await writeRow({ ...row, status, attempts, lastError, nextAttemptAt: nextAttemptAtISO });
}

export async function readDue(nowISO: string): Promise<OutboxRow[]> {
  const all = await readAll();
  return all.filter((r) => isDue(r, nowISO));
}
