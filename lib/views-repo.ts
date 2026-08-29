/**
 * Persistence for form-page view events. One row per page-load,
 * appended to a hidden `_form_views` tab in the leads Google Sheet.
 *
 * Mirrors the pattern in lib/forms-repo.ts. Tab is auto-created on
 * first append. The `_*` prefix is already skipped by getLeads()
 * (lib/sheets.ts), so views never bleed into the dashboard.
 */
import { google, sheets_v4 } from "googleapis";
import { withSheetsRetry } from "@/lib/sheets-retry";

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

  // Invalidate the in-memory cache so the next stats call reflects this view.
  rawViewsCache = null;
}

/**
 * In-memory cache of the raw rows. Hits the sheet at most once per
 * VIEWS_CACHE_TTL_MS regardless of how many concurrent stats
 * computations ask for view counts.
 */
type RawRow = { slug: string; ts: number; vid: string };
const VIEWS_CACHE_TTL_MS = 30_000;
let rawViewsCache: { rows: RawRow[]; expires: number } | null = null;

async function loadRawViewRows(): Promise<RawRow[]> {
  if (rawViewsCache && rawViewsCache.expires > Date.now()) {
    return rawViewsCache.rows;
  }
  const sheets = getSheets();
  const spreadsheetId = getSheetId();

  const rows = await withSheetsRetry(async () => {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const exists = meta.data.sheets?.some((s) => s.properties?.title === VIEWS_TAB);
    if (!exists) return [] as RawRow[];

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${VIEWS_TAB}'!A2:H`,
    });
    const raw = (res.data.values as string[][] | undefined) || [];
    let legacyCounter = 0;
    const out: RawRow[] = [];
    for (const r of raw) {
      const slug = r[0];
      const ts = Date.parse(r[1] || "");
      if (!slug || Number.isNaN(ts)) continue;
      const vid = (r[7] || "").trim() || `_legacy_${legacyCounter++}`;
      out.push({ slug, ts, vid });
    }
    return out;
  });

  rawViewsCache = { rows, expires: Date.now() + VIEWS_CACHE_TTL_MS };
  return rows;
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
 * dedup.
 */
export async function getViewCounts(days: 7 | 30 | number): Promise<Record<string, number>> {
  const rows = await loadRawViewRows();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const seen: Record<string, Set<string>> = {};
  for (const r of rows) {
    if (r.ts < cutoff) continue;
    if (!seen[r.slug]) seen[r.slug] = new Set();
    seen[r.slug].add(r.vid);
  }

  const counts: Record<string, number> = {};
  for (const slug of Object.keys(seen)) counts[slug] = seen[slug].size;
  return counts;
}
