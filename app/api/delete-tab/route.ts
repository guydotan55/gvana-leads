import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function POST() {
  try {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const spreadsheetId = process.env.GOOGLE_SHEET_ID!;

    const auth = new google.auth.JWT({
      email,
      key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const tab = meta.data.sheets?.find((s) => s.properties?.title === "אורגני");

    if (!tab?.properties?.sheetId) {
      return NextResponse.json({ message: "Tab not found" });
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ deleteSheet: { sheetId: tab.properties.sheetId } }],
      },
    });

    return NextResponse.json({ message: "Deleted אורגני tab" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
