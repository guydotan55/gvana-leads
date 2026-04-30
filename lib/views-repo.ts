/**
 * Persistence for form-page view events. One row per page-load,
 * appended to a hidden `_form_views` tab in the leads Google Sheet.
 *
 * Mirrors the pattern in lib/forms-repo.ts. Tab is auto-created on
 * first append. The `_*` prefix is already skipped by getLeads()
 * (lib/sheets.ts), so views never bleed into the dashboard.
 */
import { google, sheets_v4 } from "googleapis";

const VIEWS_TAB = "_form_views";

const VIEWS_HEADERS = [
  "slug",
  "timestamp",
  "source",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "referer",
  "visitor_id", // populated for views recorded after the unique-visitor change
] as const;

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

async function ensureViewsTab(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === VIEWS_TAB);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: VIEWS_TAB } } }],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${VIEWS_TAB}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [Array.from(VIEWS_HEADERS)] },
  });
}

export interface ViewInput {
  slug: string;
  source: "hardcoded" | "builder";
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referer?: string;
  visitorId?: string;
}

export async function appendView(input: ViewInput): Promise<void> {
  if (!input.slug?.trim()) throw new Error("slug is required");
  const sheets = getSheets();
  const spreadsheetId = getSheetId();
  await ensureViewsTab(sheets, spreadsheetId);

  const row = [
    input.slug,
    new Date().toISOString(),
    input.source,
    input.utmSource || "",
    input.utmMedium || "",
    input.utmCampaign || "",
    input.referer || "",
    input.visitorId || "",
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${VIEWS_TAB}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

/**
 * Unique visitors per slug within the past `days` days.
 *
 * A visitor is identified by their `visitor_id` cookie (column H), set
 * by /api/form-views/[slug] on first request and stable across visits.
 *
 * Legacy rows recorded before the unique-visitor change have an empty
 * visitor_id — we count each of those rows as its own visitor (one
 * row = one visit) so old data stays meaningful. New rows get proper
 * dedup. As legacy rows age out of the 30-day window, the metric
 * becomes fully accurate.
 */
export async function getViewCounts(days: 7 | 30 | number): Promise<Record<string, number>> {
  const sheets = getSheets();
  const spreadsheetId = getSheetId();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === VIEWS_TAB);
  if (!exists) return {};

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${VIEWS_TAB}'!A2:H`,
  });
  const rows = (res.data.values as string[][] | undefined) || [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  // slug → set of identifiers seen. Real visitor ids dedupe; legacy
  // empty-id rows get a synthetic per-row id so they each count once.
  const seen: Record<string, Set<string>> = {};
  let legacyCounter = 0;
  for (const row of rows) {
    const slug = row[0];
    const ts = Date.parse(row[1] || "");
    if (!slug || Number.isNaN(ts)) continue;
    if (ts < cutoff) continue;
    const vid = (row[7] || "").trim() || `_legacy_${legacyCounter++}`;
    if (!seen[slug]) seen[slug] = new Set();
    seen[slug].add(vid);
  }

  const counts: Record<string, number> = {};
  for (const slug of Object.keys(seen)) counts[slug] = seen[slug].size;
  return counts;
}
