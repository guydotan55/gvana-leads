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

/**
 * Look up a form by its stored id (a.k.a. URL slug). The Vercel /
 * Next.js edge layer occasionally hands `params.slug` to a server
 * component still URL-percent-encoded for non-ASCII paths (e.g.
 * "%D7%98%D7%A1%D7%98" instead of "טסט"). On top of that, Hebrew with
 * niqud can arrive as NFD instead of the NFC we store. We try every
 * combination so any plausible incoming form resolves.
 */
export async function getForm(id: string): Promise<FormDef | null> {
  const all = await listForms();
  const variants: string[] = [];
  const add = (s: string | undefined | null) => {
    if (!s) return;
    if (!variants.includes(s)) variants.push(s);
    try {
      const nfc = s.normalize("NFC");
      if (!variants.includes(nfc)) variants.push(nfc);
    } catch {
      // ignore — environment without normalize support
    }
  };

  add(id);
  // The string may arrive percent-encoded; try a one-shot decode.
  try {
    add(decodeURIComponent(id));
  } catch {
    // malformed encoding — ignore and stick with the literal
  }

  for (let i = 0; i < variants.length; i += 1) {
    const v = variants[i];
    const hit = all.find((f) => f.id === v || f.id.normalize("NFC") === v);
    if (hit) return hit;
  }
  return null;
}

/** Public for diagnostic 404 page. */
export async function listFormSlugs(): Promise<{ id: string; title: string; status: FormDef["status"] }[]> {
  const all = await listForms();
  return all.map((f) => ({ id: f.id, title: f.title, status: f.status }));
}

/**
 * Find sheet tabs that are NOT registered in `_forms_meta` and aren't
 * one of the known legacy / system tabs. These are likely leftover
 * submission tabs from forms deleted before delete-time cleanup was
 * implemented.
 */
const KNOWN_TAB_NAMES: ReadonlySet<string> = new Set([
  "לידים",
  "אורגני",
  "תוכנית טכנולוגית",
  "מסע משתחררים",
  "טופס מדריכים",
  "חניכים כללי",
]);

export interface OrphanTab {
  title: string;
  sheetId: number;
  dataRows: number;
}

export async function findOrphanedSubmissionTabs(): Promise<OrphanTab[]> {
  const sheets = getSheets();
  const spreadsheetId = getSheetId();
  await ensureTab(sheets, spreadsheetId, META_TAB, META_HEADERS);

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const tabs = (meta.data.sheets || []).map((s) => s.properties).filter((p) => p && p.sheetId != null);

  const registered = new Set((await listForms()).map((f) => f.sheetTab));

  const orphans: OrphanTab[] = [];
  for (const t of tabs) {
    const title = t!.title || "";
    if (!title) continue;
    if (title.startsWith("_")) continue; // already system / archived
    if (KNOWN_TAB_NAMES.has(title)) continue;
    if (registered.has(title)) continue;
    // Anything left here is an unknown tab — likely an orphan.
    let dataRows = 0;
    try {
      const r = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${title}'!A:A`,
      });
      const rows = (r.data.values as string[][] | undefined) || [];
      dataRows = rows.filter((row) => row[0]?.trim() && row[0].trim() !== "id").length;
    } catch {
      // ignore — treat as 0 rows
    }
    orphans.push({ title, sheetId: t!.sheetId!, dataRows });
  }
  return orphans;
}

export interface ReconcileResult {
  scanned: number;
  deleted: string[];
  archived: { from: string; to: string }[];
}

/**
 * Clean up orphan submission tabs.
 *  - When `onlyTitles` is undefined → all orphans are processed.
 *  - When `onlyTitles` is an array  → only orphans whose title is in
 *    that array get processed; others are left alone.
 */
export async function reconcileOrphanedTabs(onlyTitles?: string[]): Promise<ReconcileResult> {
  const sheets = getSheets();
  const spreadsheetId = getSheetId();
  const allOrphans = await findOrphanedSubmissionTabs();
  const filter = onlyTitles && onlyTitles.length > 0 ? new Set(onlyTitles) : null;
  const orphans = filter ? allOrphans.filter((o) => filter.has(o.title)) : allOrphans;

  const deleted: string[] = [];
  const archived: { from: string; to: string }[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const orphan of orphans) {
    if (orphan.dataRows === 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ deleteSheet: { sheetId: orphan.sheetId } }] },
      });
      deleted.push(orphan.title);
    } else {
      const archivedBase = `_archived_${orphan.title}_${today}`.slice(0, 95);
      const archivedName = await uniqueTabName(sheets, spreadsheetId, archivedBase);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              updateSheetProperties: {
                properties: { sheetId: orphan.sheetId, title: archivedName },
                fields: "title",
              },
            },
          ],
        },
      });
      archived.push({ from: orphan.title, to: archivedName });
    }
  }

  return { scanned: orphans.length, deleted, archived };
}

function slugify(input: string): string {
  // Normalize first so the same visual title always maps to the same slug,
  // regardless of NFC/NFD source (browsers and OS keyboards can produce
  // either when typing Hebrew with niqud).
  return input
    .normalize("NFC")
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

/**
 * Delete a builder-form definition AND clean up its submission tab.
 *
 * Behavior:
 *  - The row in `_forms_meta` is always removed.
 *  - The per-form submission tab is then handled based on its content:
 *    - Empty (header row only, or fewer than `MIN_KEEP_ROWS` data rows)
 *      → tab is deleted entirely. Pure cleanup, no data loss.
 *    - Has real submissions → tab is renamed with an `_archived_` prefix
 *      so the dashboard's `_*` filter hides it but the data is preserved
 *      and recoverable. The user sees the sheet "auto-sync" with the
 *      dashboard while never losing real lead data.
 */
export async function deleteForm(id: string): Promise<{ tabAction: "deleted" | "archived" | "kept"; archivedTab?: string }> {
  const sheets = getSheets();
  const spreadsheetId = getSheetId();

  const found = await findRowByFormId(sheets, spreadsheetId, id);
  if (!found) return { tabAction: "kept" };

  const def = rowToFormDef(found.row);
  const formSheetTab = def?.sheetTab || "";

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const metaSheet = meta.data.sheets?.find((s) => s.properties?.title === META_TAB);
  const metaSheetId = metaSheet?.properties?.sheetId;
  if (metaSheetId === undefined || metaSheetId === null) {
    throw new Error("Meta tab missing");
  }

  // Step 1: remove the meta row.
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: metaSheetId,
              dimension: "ROWS",
              startIndex: found.rowNumber - 1,
              endIndex: found.rowNumber,
            },
          },
        },
      ],
    },
  });

  // Step 2: clean up the submission tab if it exists.
  const submissionSheet = formSheetTab
    ? meta.data.sheets?.find((s) => s.properties?.title === formSheetTab)
    : undefined;
  if (!submissionSheet || submissionSheet.properties?.sheetId == null) {
    return { tabAction: "kept" };
  }
  const submissionSheetId = submissionSheet.properties.sheetId;

  // Read just column A to count data rows (rows where A is non-empty
  // and isn't the literal "id" header).
  const colA = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${formSheetTab}'!A:A`,
  });
  const rows = (colA.data.values as string[][] | undefined) || [];
  const dataRows = rows.filter((r) => r[0]?.trim() && r[0].trim() !== "id").length;

  if (dataRows === 0) {
    // Empty tab — safe to delete.
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ deleteSheet: { sheetId: submissionSheetId } }],
      },
    });
    return { tabAction: "deleted" };
  }

  // Has data — rename with `_archived_<title>_<YYYY-MM-DD>` so it stays
  // in the sheet but is hidden from the dashboard (which skips `_*`).
  const today = new Date().toISOString().slice(0, 10);
  const archivedBase = `_archived_${formSheetTab}_${today}`.slice(0, 95); // sheet titles cap at 100 chars
  const archivedName = await uniqueTabName(sheets, spreadsheetId, archivedBase);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId: submissionSheetId, title: archivedName },
            fields: "title",
          },
        },
      ],
    },
  });
  return { tabAction: "archived", archivedTab: archivedName };
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
