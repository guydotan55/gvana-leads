import { google, sheets_v4 } from "googleapis";
import columnsConfig from "@/config/columns.json";

export interface Lead {
  row: number;
  name: string;
  phone: string;
  email: string;
  source: string;
  status: string;
  lastMessage: string;
  lastMessageDate: string;
  messageId: string;
  createdAt: string;
  notes: string;
}

function getSheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID env var is required");
  return id;
}

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error("Google service account credentials are required");
  }
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheets(): sheets_v4.Sheets {
  return google.sheets({ version: "v4", auth: getAuth() });
}

function rowToLead(row: string[], rowIndex: number): Lead {
  const col = columnsConfig.columns;
  return {
    row: rowIndex,
    name: row[col.name.index] || "",
    phone: row[col.phone.index] || "",
    email: row[col.email.index] || "",
    source: row[col.source.index] || "",
    status: row[col.status.index] || "new",
    lastMessage: row[col.lastMessage.index] || "",
    lastMessageDate: row[col.lastMessageDate.index] || "",
    messageId: row[col.messageId.index] || "",
    createdAt: row[col.createdAt.index] || "",
    notes: row[col.notes.index] || "",
  };
}

export async function getLeads(): Promise<Lead[]> {
  const sheets = getSheets();
  const sheetName = columnsConfig.sheetName;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A2:Z`,
  });

  const rows = response.data.values || [];
  return rows.map((row, i) => rowToLead(row as string[], i + 2));
}

export async function updateLeadCell(
  row: number,
  columnKey: keyof typeof columnsConfig.columns,
  value: string
): Promise<void> {
  const sheets = getSheets();
  const sheetName = columnsConfig.sheetName;
  const colIndex = columnsConfig.columns[columnKey].index;
  const colLetter = String.fromCharCode(65 + colIndex);

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!${colLetter}${row}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

export async function updateLeadCells(
  row: number,
  updates: Partial<Record<keyof typeof columnsConfig.columns, string>>
): Promise<void> {
  const promises = Object.entries(updates).map(([key, value]) =>
    updateLeadCell(row, key as keyof typeof columnsConfig.columns, value)
  );
  await Promise.all(promises);
}

export async function appendLead(
  data: Partial<Record<keyof typeof columnsConfig.columns, string>>
): Promise<void> {
  const sheets = getSheets();
  const sheetName = columnsConfig.sheetName;
  const col = columnsConfig.columns;

  const maxIndex = Math.max(...Object.values(col).map((c) => c.index));
  const row = new Array(maxIndex + 1).fill("");

  for (const [key, value] of Object.entries(data)) {
    const colConfig = col[key as keyof typeof col];
    if (colConfig && value) {
      row[colConfig.index] = value;
    }
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A:Z`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}
