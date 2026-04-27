/**
 * Persistence layer for builder-created forms.
 *
 * - Form definitions are stored in a dedicated `_forms_meta` tab in the
 *   same Google Sheet as the leads. Tabs starting with `_` are skipped
 *   by getLeads() so this never bleeds into the dashboard.
 * - Per-form submission tabs use the same header layout as the existing
 *   `אורגני` tab so the dashboard auto-discovers them with no extra work.
 */
import { google, sheets_v4 } from "googleapis";
import type { FormDef, FormField } from "@/config/forms";
import { RESERVED_SLUGS } from "@/config/forms";

const META_TAB = "_forms_meta";

const META_HEADERS = [
  "id",
  "title",
  "subtitle",
  "status",
  "createdAt",
  "updatedAt",
  "sheetTab",
  "fieldsJson",
] as const;

/** Header layout for per-form submission tabs — matches `אורגני`. */
const SUBMISSION_HEADERS = [
  "id",
  "created_time",
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "form_id",
  "form_name",
  "is_organic",
  "platform",
  "interest",
  "full_name",
  "phone_number",
  "lead_status",
  "", // Q gap
  "סטטוס",
  "הודעה אחרונה",
  "תאריך הודעה",
  "מזהה הודעה",
  "הערות",
  "ניסיונות",
  "תוכנית",
  "טופל ע\"י",
];

function getSheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID env var is required");
  return id;
}

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google service account credentials are required");
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheets(): sheets_v4.Sheets {
  return google.sheets({ version: "v4", auth: getAuth() });
}

async function ensureTab(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string,
  headers: readonly string[]
): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === tabName);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: tabName } } }],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [Array.from(headers)] },
  });
}

function rowToFormDef(row: string[]): FormDef | null {
  const [id, title, subtitle, status, createdAt, updatedAt, sheetTab, fieldsJson] = row;
  if (!id || !title) return null;
  let fields: FormField[] = [];
  try {
    fields = fieldsJson ? JSON.parse(fieldsJson) : [];
  } catch {
    fields = [];
  }
  const safeStatus: FormDef["status"] = status === "published" ? "published" : "draft";
  return {
    id,
    title,
    subtitle: subtitle || undefined,
    status: safeStatus,
    createdAt: createdAt || "",
    updatedAt: updatedAt || "",
    sheetTab: sheetTab || title,
    fields,
  };
}

function formDefToRow(def: FormDef): string[] {
  return [
    def.id,
    def.title,
    def.subtitle || "",
    def.status,
    def.createdAt,
    def.updatedAt,
    def.sheetTab,
    JSON.stringify(def.fields),
  ];
}

export async function listForms(): Promise<FormDef[]> {
  const sheets = getSheets();
  const spreadsheetId = getSheetId();
  await ensureTab(sheets, spreadsheetId, META_TAB, META_HEADERS);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${META_TAB}'!A2:H`,
  });
  const rows = (res.data.values as string[][] | undefined) || [];
  const forms: FormDef[] = [];
  for (const row of rows) {
    const def = rowToFormDef(row);
    if (def) forms.push(def);
  }
  return forms;
}

export async function getForm(id: string): Promise<FormDef | null> {
  const all = await listForms();
  return all.find((f) => f.id === id) || null;
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9֐-׿-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function uniqueSlug(base: string, existing: FormDef[]): Promise<string> {
  let slug = slugify(base) || `form-${Date.now()}`;
  if (RESERVED_SLUGS.has(slug)) slug = `${slug}-form`;
  const taken = new Set(existing.map((f) => f.id));
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n += 1;
  return `${slug}-${n}`;
}

export interface CreateFormInput {
  title: string;
  subtitle?: string;
  fields: FormField[];
  status?: "draft" | "published";
  /** Optional desired slug — falls back to slugify(title). Auto-uniques. */
  slug?: string;
}

export async function createForm(input: CreateFormInput): Promise<FormDef> {
  if (!input.title?.trim()) throw new Error("Title is required");
  if (!Array.isArray(input.fields) || input.fields.length === 0) {
    throw new Error("At least one field is required");
  }

  const sheets = getSheets();
  const spreadsheetId = getSheetId();
  await ensureTab(sheets, spreadsheetId, META_TAB, META_HEADERS);

  const existing = await listForms();
  const id = await uniqueSlug(input.slug || input.title, existing);
  const now = new Date().toISOString();
  const status = input.status || "draft";
  // Sheet tab name: keep human-readable but unique. Use title; fall back to id.
  const sheetTabBase = input.title.trim().slice(0, 60);
  const sheetTab = await uniqueTabName(sheets, spreadsheetId, sheetTabBase || id);

  const def: FormDef = {
    id,
    title: input.title.trim(),
    subtitle: input.subtitle?.trim() || undefined,
    status,
    createdAt: now,
    updatedAt: now,
    sheetTab,
    fields: input.fields,
  };

  if (status === "published") {
    await ensureTab(sheets, spreadsheetId, sheetTab, SUBMISSION_HEADERS);
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${META_TAB}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [formDefToRow(def)] },
  });

  return def;
}

async function uniqueTabName(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  base: string
): Promise<string> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const taken = new Set(meta.data.sheets?.map((s) => s.properties?.title) || []);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

async function findRowByFormId(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  formId: string
): Promise<{ rowNumber: number; row: string[] } | null> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${META_TAB}'!A2:H`,
  });
  const rows = (res.data.values as string[][] | undefined) || [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === formId) {
      return { rowNumber: i + 2, row: rows[i] };
    }
  }
  return null;
}

export interface UpdateFormInput {
  title?: string;
  subtitle?: string;
  fields?: FormField[];
  status?: "draft" | "published";
}

export async function updateForm(id: string, input: UpdateFormInput): Promise<FormDef> {
  const sheets = getSheets();
  const spreadsheetId = getSheetId();

  const found = await findRowByFormId(sheets, spreadsheetId, id);
  if (!found) throw new Error("Form not found");
  const existing = rowToFormDef(found.row);
  if (!existing) throw new Error("Form is corrupted");

  const updated: FormDef = {
    ...existing,
    title: input.title?.trim() || existing.title,
    subtitle: input.subtitle?.trim() ?? existing.subtitle,
    fields: input.fields ?? existing.fields,
    status: input.status ?? existing.status,
    updatedAt: new Date().toISOString(),
  };

  if (updated.status === "published") {
    await ensureTab(sheets, spreadsheetId, updated.sheetTab, SUBMISSION_HEADERS);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${META_TAB}'!A${found.rowNumber}:H${found.rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [formDefToRow(updated)] },
  });

  return updated;
}

export async function deleteForm(id: string): Promise<void> {
  const sheets = getSheets();
  const spreadsheetId = getSheetId();

  const found = await findRowByFormId(sheets, spreadsheetId, id);
  if (!found) return;

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const metaSheet = meta.data.sheets?.find((s) => s.properties?.title === META_TAB);
  const sheetId = metaSheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) {
    throw new Error("Meta tab missing");
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
              startIndex: found.rowNumber - 1,
              endIndex: found.rowNumber,
            },
          },
        },
      ],
    },
  });
  // Submission tab is intentionally retained — submitted leads still
  // matter even if the form is decommissioned.
}

export interface SubmissionInput {
  fullName: string;
  phone: string;
  fields: Record<string, string | string[]>;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export async function appendSubmission(form: FormDef, input: SubmissionInput): Promise<string> {
  const sheets = getSheets();
  const spreadsheetId = getSheetId();
  await ensureTab(sheets, spreadsheetId, form.sheetTab, SUBMISSION_HEADERS);

  const now = new Date().toISOString();
  const id = `org:${Date.now()}`;
  const isPaid =
    input.utmSource === "facebook" ||
    input.utmSource === "instagram" ||
    input.utmMedium === "paid";
  const platform = isPaid ? input.utmSource || "fb" : "organic";

  // Build notes from custom fields (skip name & phone — they have own columns).
  const notesLines: string[] = [];
  for (const field of form.fields) {
    if (field.id === "fullName" || field.id === "phone") continue;
    const raw = input.fields[field.id];
    if (raw === undefined || raw === null) continue;
    const value = Array.isArray(raw) ? raw.filter(Boolean).join(", ") : String(raw);
    if (!value.trim()) continue;
    notesLines.push(`${field.label}: ${value.trim()}`);
  }
  const notes = notesLines.join("\n");

  const row = [
    id,
    now,
    "",
    "",
    "",
    "",
    "",
    input.utmCampaign || "",
    "",
    form.title,
    isPaid ? "false" : "true",
    platform,
    "",
    input.fullName.trim(),
    input.phone.trim(),
    "CREATED",
    "",
    "new",
    "",
    "",
    "",
    notes,
    "",
    "",
    "",
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${form.sheetTab}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });

  return id;
}
