import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const ORGANIC_TAB = "אורגני";

// Full headers: FB columns (A-P) + gap (Q) + dashboard columns (R-Y)
const HEADERS = [
  "id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name",
  "campaign_id", "campaign_name", "form_id", "form_name", "is_organic",
  "platform", "interest", "full_name", "phone_number", "lead_status",
  "",          // Q: gap
  "סטטוס",     // R: status
  "הודעה אחרונה", // S: lastMessage
  "תאריך הודעה",  // T: lastMessageDate
  "מזהה הודעה",   // U: messageId
  "הערות",       // V: notes
  "ניסיונות",    // W: attempts
  "תוכנית",     // X: plan
  "טופל ע\"י",   // Y: handledBy
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
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: ORGANIC_TAB } } }],
      },
    });

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
    const { fullName, phone, type, extras, utmSource, utmMedium, utmCampaign } = body;

    if (!fullName?.trim() || !phone?.trim()) {
      return NextResponse.json({ error: "Name and phone are required" }, { status: 400 });
    }

    if (!["student", "instructor"].includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID required");

    const sheets = google.sheets({ version: "v4", auth: getAuth() });

    await ensureTabExists(sheets, spreadsheetId);

    const now = new Date().toISOString();
    const organicId = `org:${Date.now()}`;

    // Determine platform from UTM: facebook/instagram = "fb"/"ig", otherwise "organic"
    const isPaid = utmSource === "facebook" || utmSource === "instagram" || utmMedium === "paid";
    const platform = isPaid ? (utmSource || "fb") : "organic";
    const typeLabel = type === "instructor" ? "מדריכים" : "חניכים";
    const sourceLabel = isPaid ? "ממומן" : "אורגני";
    const formName = `${sourceLabel} - ${typeLabel}`;
    const campaignName = utmCampaign || "";

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

    // Full row: A-Y in one shot
    const row = [
      organicId,       // A: id
      now,             // B: created_time
      "",              // C: ad_id
      "",              // D: ad_name
      "",              // E: adset_id
      "",              // F: adset_name
      "",              // G: campaign_id
      campaignName,    // H: campaign_name
      "",              // I: form_id
      formName,        // J: form_name
      isPaid ? "false" : "true", // K: is_organic
      platform,        // L: platform
      "",              // M: interest
      fullName.trim(), // N: full_name
      phone.trim(),    // O: phone_number
      "CREATED",       // P: lead_status
      "",              // Q: gap
      "new",           // R: status
      "",              // S: lastMessage
      "",              // T: lastMessageDate
      "",              // U: messageId
      notes,           // V: notes
      "",              // W: attempts
      "",              // X: plan
      "",              // Y: handledBy
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${ORGANIC_TAB}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Organic lead submission failed:", error);
    return NextResponse.json({ error: "Failed to submit lead" }, { status: 500 });
  }
}
