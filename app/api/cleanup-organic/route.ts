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
    const sheetName = "לידים";

    // Get all data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A1:Y`,
    });

    const rows = response.data.values || [];

    // Find rows that start with "org:" (organic leads written to wrong tab)
    const rowsToDelete: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0]?.startsWith("org:")) {
        rowsToDelete.push(i);
      }
    }

    if (rowsToDelete.length === 0) {
      return NextResponse.json({ message: "No organic rows found in לידים tab", deleted: 0 });
    }

    // Get sheet ID for delete requests
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetName);
    const sheetId = sheet?.properties?.sheetId;

    if (sheetId === undefined) {
      return NextResponse.json({ error: "Sheet not found" }, { status: 404 });
    }

    // Delete rows in reverse order (so indices don't shift)
    const requests = rowsToDelete
      .sort((a, b) => b - a)
      .map((rowIndex) => ({
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: rowIndex,
            endIndex: rowIndex + 1,
          },
        },
      }));

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });

    return NextResponse.json({
      message: `Deleted ${rowsToDelete.length} organic rows from לידים tab`,
      deleted: rowsToDelete.length,
      rows: rowsToDelete.map((i) => i + 1),
    });
  } catch (error) {
    console.error("Cleanup failed:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
