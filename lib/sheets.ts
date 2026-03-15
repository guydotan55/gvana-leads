import { google, sheets_v4 } from "googleapis";
import columnsConfig from "@/config/columns.json";

const VALID_STATUSES = ["new", "sent", "read", "qualified"];

export interface Lead {
  row: number;
  // Facebook columns (read-only)
  leadId: string;
  createdTime: string;
  adId: string;
  adName: string;
  adsetId: string;
  adsetName: string;
  campaignId: string;
  campaignName: string;
  formId: string;
  formName: string;
  isOrganic: string;
  platform: string;
  interest: string;
  fullName: string;
  phone: string;
  leadStatus: string;
  // Dashboard columns (read-write)
  status: string;
  lastMessage: string;
  lastMessageDate: string;
  messageId: string;
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

function isHeaderRow(row: string[]): boolean {
  return row[0] === "id";
}

function stripLeadIdPrefix(value: string): string {
  if (value.startsWith("l:")) return value.slice(2);
  return value;
}

function stripPhonePrefix(value: string): string {
  if (value.startsWith("p:")) return value.slice(2);
  return value;
}

function rowToLead(row: string[], rowIndex: number): Lead {
  const fb = columnsConfig.fbColumns;
  const db = columnsConfig.dashboardColumns;

  const rawStatus = row[db.status.index] || "";
  const status = VALID_STATUSES.includes(rawStatus) ? rawStatus : "new";

  return {
    row: rowIndex,
    leadId: stripLeadIdPrefix(row[fb.leadId.index] || ""),
    createdTime: row[fb.createdTime.index] || "",
    adId: row[fb.adId.index] || "",
    adName: row[fb.adName.index] || "",
    adsetId: row[fb.adsetId.index] || "",
    adsetName: row[fb.adsetName.index] || "",
    campaignId: row[fb.campaignId.index] || "",
    campaignName: row[fb.campaignName.index] || "",
    formId: row[fb.formId.index] || "",
    formName: row[fb.formName.index] || "",
    isOrganic: row[fb.isOrganic.index] || "",
    platform: row[fb.platform.index] || "",
    interest: row[fb.interest.index] || "",
    fullName: row[fb.fullName.index] || "",
    phone: stripPhonePrefix(row[fb.phoneNumber.index] || ""),
    leadStatus: row[fb.leadStatus.index] || "",
    status,
    lastMessage: row[db.lastMessage.index] || "",
    lastMessageDate: row[db.lastMessageDate.index] || "",
    messageId: row[db.messageId.index] || "",
    notes: row[db.notes.index] || "",
  };
}

export async function getLeads(): Promise<Lead[]> {
  const sheets = getSheets();
  const sheetName = columnsConfig.sheetName;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A1:V`,
  });

  const rows = response.data.values || [];
  return rows
    .map((row, i) => ({ row: row as string[], index: i + 1 }))
    .filter(({ row }) => !isHeaderRow(row) && row[0]?.trim() !== "")
    .map(({ row, index }) => rowToLead(row, index));
}

type DashboardColumnKey = keyof typeof columnsConfig.dashboardColumns;

export async function updateLeadCell(
  row: number,
  columnKey: DashboardColumnKey,
  value: string
): Promise<void> {
  const sheets = getSheets();
  const sheetName = columnsConfig.sheetName;
  const colLetter = columnsConfig.dashboardColumns[columnKey].letter;

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!${colLetter}${row}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

export async function updateLeadCells(
  row: number,
  updates: Partial<Record<DashboardColumnKey, string>>
): Promise<void> {
  const promises = Object.entries(updates).map(([key, value]) =>
    updateLeadCell(row, key as DashboardColumnKey, value!)
  );
  await Promise.all(promises);
}
