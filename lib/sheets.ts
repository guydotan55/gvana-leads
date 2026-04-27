import { google, sheets_v4 } from "googleapis";
import columnsConfig from "@/config/columns.json";

export const VALID_STATUSES = ["new", "relevant", "not_relevant", "not_relevant_target", "unavailable", "under_review", "accepted", "rejected"];

export interface Lead {
  row: number;
  sheetTab: string;
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
  attempts: number;
  plan: string;
  handledBy: string;
  comment: string;
}

/* ---------- Header alias map for dynamic column detection ---------- */

const HEADER_ALIASES: Record<string, string[]> = {
  leadId: ["id"],
  createdTime: ["created_time"],
  adId: ["ad_id"],
  adName: ["ad_name"],
  adsetId: ["adset_id"],
  adsetName: ["adset_name"],
  campaignId: ["campaign_id"],
  campaignName: ["campaign_name"],
  formId: ["form_id"],
  formName: ["form_name"],
  isOrganic: ["is_organic"],
  platform: ["platform"],
  interest: ["interest"],
  fullName: ["full_name", "שם_מלא"],
  phone: ["phone_number", "phone"],
  leadStatus: ["lead_status"],
  // Dashboard columns
  status: ["סטטוס"],
  lastMessage: ["הודעה אחרונה"],
  lastMessageDate: ["תאריך הודעה"],
  messageId: ["מזהה הודעה"],
  notes: ["הערות"],
  attempts: ["ניסיונות"],
  plan: ["תוכנית"],
  handledBy: ["טופל ע\"י"],
  comment: ["הערה פנימית", "הערה_פנימית", "comment"],
};

/** Known header names used to detect whether the first row is a header row */
const KNOWN_HEADERS = ["id", "created_time", "ad_id", "form_id", "lead_status"];

function buildColumnMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = headers.findIndex((h) => aliases.includes(h));
    if (idx !== -1) map[field] = idx;
  }
  return map;
}

/* ---------- Helpers ---------- */

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

function stripLeadIdPrefix(value: string): string {
  if (value.startsWith("l:")) return value.slice(2);
  return value;
}

function stripPhonePrefix(value: string): string {
  if (value.startsWith("p:")) return value.slice(2);
  return value;
}

/* ---------- Row-to-Lead conversion ---------- */

function rowToLeadDynamic(
  row: string[],
  rowIndex: number,
  sheetTab: string,
  colMap: Record<string, number>
): Lead {
  const get = (field: string) => row[colMap[field] ?? -1] || "";

  const rawStatus = colMap.status !== undefined ? row[colMap.status] || "" : "";
  const status = VALID_STATUSES.includes(rawStatus) ? rawStatus : "new";

  return {
    row: rowIndex,
    sheetTab,
    leadId: stripLeadIdPrefix(get("leadId")),
    createdTime: get("createdTime"),
    adId: get("adId"),
    adName: get("adName"),
    adsetId: get("adsetId"),
    adsetName: get("adsetName"),
    campaignId: get("campaignId"),
    campaignName: get("campaignName"),
    formId: get("formId"),
    formName: get("formName"),
    isOrganic: get("isOrganic"),
    platform: get("platform"),
    interest: get("interest") || "",
    fullName: get("fullName"),
    phone: stripPhonePrefix(get("phone")),
    leadStatus: get("leadStatus"),
    status,
    lastMessage: get("lastMessage") || "",
    lastMessageDate: get("lastMessageDate") || "",
    messageId: get("messageId") || "",
    notes: get("notes") || "",
    attempts: parseInt(get("attempts") || "0", 10) || 0,
    plan: get("plan") || "",
    handledBy: get("handledBy") || "",
    comment: get("comment") || "",
  };
}

/** Build a column map from the fixed config (for the header-less "לידים" tab) */
function buildFixedColumnMap(): Record<string, number> {
  const fb = columnsConfig.fbColumns;
  const db = columnsConfig.dashboardColumns;
  return {
    leadId: fb.leadId.index,
    createdTime: fb.createdTime.index,
    adId: fb.adId.index,
    adName: fb.adName.index,
    adsetId: fb.adsetId.index,
    adsetName: fb.adsetName.index,
    campaignId: fb.campaignId.index,
    campaignName: fb.campaignName.index,
    formId: fb.formId.index,
    formName: fb.formName.index,
    isOrganic: fb.isOrganic.index,
    platform: fb.platform.index,
    interest: fb.interest.index,
    fullName: fb.fullName.index,
    phone: fb.phoneNumber.index,
    leadStatus: fb.leadStatus.index,
    status: db.status.index,
    lastMessage: db.lastMessage.index,
    lastMessageDate: db.lastMessageDate.index,
    messageId: db.messageId.index,
    notes: db.notes.index,
    attempts: db.attempts.index,
    plan: db.plan.index,
    handledBy: db.handledBy.index,
    comment: db.comment.index,
  };
}

/* ---------- Public API ---------- */

export async function getLeads(): Promise<Lead[]> {
  const sheets = getSheets();
  const spreadsheetId = getSheetId();
  const defaultSheetName = columnsConfig.sheetName; // "לידים"

  // Get all tab names
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const tabNames = (
    meta.data.sheets?.map((s) => s.properties?.title).filter(Boolean) as string[]
  ) || [];

  const allLeads: Lead[] = [];

  for (const tabName of tabNames) {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!A1:Z`,
    });

    const rows = response.data.values || [];
    if (rows.length === 0) continue;

    // Check if first row is a header row
    const firstRow = rows[0];
    const hasHeaders = firstRow.some((cell: string) =>
      KNOWN_HEADERS.includes(cell)
    );

    if (hasHeaders) {
      // Dynamic mapping from headers
      const colMap = buildColumnMap(firstRow);
      // Process data rows (skip header)
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] as string[];
        if (!row[0]?.trim() || row[0] === "id") continue; // skip empty and duplicate headers
        allLeads.push(rowToLeadDynamic(row, i + 1, tabName, colMap));
      }
    } else if (tabName === defaultSheetName) {
      // Fixed mapping for the "לידים" tab (no headers)
      const colMap = buildFixedColumnMap();
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as string[];
        if (!row[0]?.trim() || row[0] === "id" || row[0] === "ad_name") continue;
        allLeads.push(rowToLeadDynamic(row, i + 1, tabName, colMap));
      }
    }
    // Skip tabs that have no headers and aren't the default tab
  }

  // Sort by createdTime descending (newest first)
  allLeads.sort((a, b) => {
    if (!a.createdTime && !b.createdTime) return 0;
    if (!a.createdTime) return 1;
    if (!b.createdTime) return -1;
    return b.createdTime.localeCompare(a.createdTime);
  });

  return allLeads;
}

type DashboardColumnKey = keyof typeof columnsConfig.dashboardColumns;

export async function updateLeadCell(
  sheetTab: string,
  row: number,
  columnKey: DashboardColumnKey,
  value: string
): Promise<void> {
  const sheets = getSheets();
  const colLetter = columnsConfig.dashboardColumns[columnKey].letter;

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `'${sheetTab}'!${colLetter}${row}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

export async function updateLeadCells(
  sheetTab: string,
  row: number,
  updates: Partial<Record<DashboardColumnKey, string>>
): Promise<void> {
  const promises = Object.entries(updates).map(([key, value]) =>
    updateLeadCell(sheetTab, row, key as DashboardColumnKey, value!)
  );
  await Promise.all(promises);
}

export async function deleteLead(sheetTab: string, row: number): Promise<void> {
  const sheets = getSheets();
  const spreadsheetId = getSheetId();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetTab);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) {
    throw new Error(`Sheet tab not found: ${sheetTab}`);
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: row - 1,
              endIndex: row,
            },
          },
        },
      ],
    },
  });
}
