import { getSheets, getSheetId, ensureTabWithHeader } from "@/lib/sheets";
import { withSheetsRetry } from "@/lib/sheets-retry";

const TAB = "_form_labels";
const HEADER = ["formId", "sheetTab", "label", "sourceName", "updatedAt"];

export interface FormMapping {
  formId: string;
  sheetTab: string;
  sourceName: string;
  label: string;
}

export function parseFormLabelsRows(rows: string[][]): FormMapping[] {
  return (rows || [])
    .filter((r) => r[0] && r[0] !== "formId")
    .map((r) => ({
      formId: r[0],
      sheetTab: r[1] || "",
      label: r[2] || "",
      sourceName: r[3] || "",
    }));
}

export function findTabByFormId(maps: FormMapping[], formId: string): string | null {
  return maps.find((m) => m.formId === formId)?.sheetTab ?? null;
}

export async function getFormMappings(): Promise<FormMapping[]> {
  try {
    const sheets = getSheets();
    const res = await withSheetsRetry(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId: getSheetId(),
        range: `'${TAB}'!A1:E`,
      })
    );
    return parseFormLabelsRows((res.data.values as string[][]) || []);
  } catch {
    return []; // tab not created yet
  }
}

export async function upsertFormMapping(m: FormMapping): Promise<void> {
  await ensureTabWithHeader(TAB, HEADER);
  const sheets = getSheets();
  const existing = await getFormMappings();
  const idx = existing.findIndex((x) => x.formId === m.formId);
  const rowValues = [m.formId, m.sheetTab, m.label, m.sourceName, new Date().toISOString()];
  if (idx === -1) {
    await withSheetsRetry(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId: getSheetId(),
        range: `'${TAB}'!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [rowValues] },
      })
    );
  } else {
    const rowNumber = idx + 2; // +1 header, +1 for 1-based
    await withSheetsRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId: getSheetId(),
        range: `'${TAB}'!A${rowNumber}:E${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: { values: [rowValues] },
      })
    );
  }
}
