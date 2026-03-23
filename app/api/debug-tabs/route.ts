import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET() {
  try {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    const auth = new google.auth.JWT({
      email,
      key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    // Get all sheet names
    const meta = await sheets.spreadsheets.get({ spreadsheetId: spreadsheetId! });
    const sheetNames = meta.data.sheets?.map((s) => s.properties?.title) || [];

    const results: Record<string, unknown> = { tabs: sheetNames };

    // Read first 2 rows from each tab
    for (const name of sheetNames) {
      if (!name) continue;
      try {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: spreadsheetId!,
          range: `'${name}'!A1:Z2`,
        });
        const rows = res.data.values || [];
        results[name] = {
          headers: rows[0] || [],
          firstRow: rows[1] || [],
          columnCount: rows[0]?.length || 0,
        };
      } catch (e) {
        results[name] = { error: String(e) };
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
