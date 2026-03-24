import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const ORGANIC_TAB = "אורגני";

const HEADERS = [
  "id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name",
  "campaign_id", "campaign_name", "form_id", "form_name", "is_organic",
  "platform", "interest", "full_name", "phone_number", "lead_status",
];

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google credentials required");
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function ensureTabExists(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === ORGANIC_TAB);

  if (!exists) {
    // Create the tab
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: ORGANIC_TAB } } }],
      },
    });

    // Add headers
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${ORGANIC_TAB}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [HEADERS] },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fullName, phone, type, extras } = body;

    if (!fullName?.trim() || !phone?.trim()) {
      return NextResponse.json({ error: "Name and phone are required" }, { status: 400 });
    }

    if (!["student", "instructor"].includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID required");

    const sheets = google.sheets({ version: "v4", auth: getAuth() });

    // Ensure the "אורגני" tab exists with headers
    await ensureTabExists(sheets, spreadsheetId);

    const now = new Date().toISOString();
    const formName = type === "instructor" ? "אורגני - מדריכים" : "אורגני - חניכים";
    const organicId = `org:${Date.now()}`;

    // Build notes from extra fields
    let notes = "";
    if (extras && typeof extras === "object") {
      const lines: string[] = [];
      for (const [key, value] of Object.entries(extras)) {
        if (value && typeof value === "string" && value.trim()) {
          lines.push(`${key}: ${value.trim()}`);
        }
      }
      notes = lines.join("\n");
    }

    // Row matches HEADERS order, plus dashboard columns after
    const row = [
      organicId,       // id
      now,             // created_time
      "",              // ad_id
      "",              // ad_name
      "",              // adset_id
      "",              // adset_name
      "",              // campaign_id
      "",              // campaign_name
      "",              // form_id
      formName,        // form_name
      "true",          // is_organic
      "organic",       // platform
      "",              // interest
      fullName.trim(), // full_name
      phone.trim(),    // phone_number
      "CREATED",       // lead_status
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${ORGANIC_TAB}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    // Write notes to column V (index 21) if present — same position as dashboard notes
    if (notes) {
      // Get the row number that was just appended
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${ORGANIC_TAB}'!A:A`,
      });
      const lastRow = response.data.values?.length || 1;

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${ORGANIC_TAB}'!V${lastRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[notes]] },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Organic lead submission failed:", error);
    return NextResponse.json({ error: "Failed to submit lead" }, { status: 500 });
  }
}
