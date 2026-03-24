import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

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

export async function POST(request: NextRequest) {
  try {
    const { fullName, phone, type } = await request.json();

    if (!fullName?.trim() || !phone?.trim()) {
      return NextResponse.json({ error: "Name and phone are required" }, { status: 400 });
    }

    if (!["student", "instructor"].includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID required");

    const sheets = google.sheets({ version: "v4", auth: getAuth() });
    const sheetName = "לידים";

    const now = new Date().toISOString();
    const formName = type === "instructor" ? "אורגני - מדריכים" : "אורגני - חניכים";

    // Match the column structure: A=id, B=created_time, ..., J=form_name, K=is_organic, L=platform, M=interest, N=full_name, O=phone
    const row = [
      "",              // A: id (empty for organic)
      now,             // B: created_time
      "",              // C: ad_id
      "",              // D: ad_name
      "",              // E: adset_id
      "",              // F: adset_name
      "",              // G: campaign_id
      "",              // H: campaign_name
      "",              // I: form_id
      formName,        // J: form_name
      "true",          // K: is_organic
      "organic",       // L: platform
      "",              // M: interest
      fullName.trim(), // N: full_name
      phone.trim(),    // O: phone
      "",              // P: lead_status
      "",              // Q: (gap)
      "new",           // R: status (dashboard)
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${sheetName}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Organic lead submission failed:", error);
    return NextResponse.json({ error: "Failed to submit lead" }, { status: 500 });
  }
}
