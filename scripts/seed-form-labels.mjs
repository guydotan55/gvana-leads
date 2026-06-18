// scripts/seed-form-labels.mjs — run once: `node scripts/seed-form-labels.mjs`
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { google } from "googleapis";

loadEnvConfig(process.cwd());

const TAB = "_form_labels";
const HEADER = ["formId", "sheetTab", "label", "sourceName", "updatedAt"];
const ROW = ["859292457130080", "קמפיין משתמטים", "קמפיין משתמטים", "תוכנית משתמטים", new Date().toISOString()];

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const spreadsheetId = process.env.GOOGLE_SHEET_ID;

const meta = await sheets.spreadsheets.get({ spreadsheetId });
const exists = (meta.data.sheets || []).some((s) => s.properties?.title === TAB);
if (!exists) {
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] } });
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `'${TAB}'!A1`, valueInputOption: "RAW", requestBody: { values: [HEADER] } });
}
const cur = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${TAB}'!A1:E` });
const has = ((cur.data.values || []).some((r) => r[0] === ROW[0]));
if (has) { console.log("backfill row already present — nothing to do"); process.exit(0); }
await sheets.spreadsheets.values.append({ spreadsheetId, range: `'${TAB}'!A1`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: [ROW] } });
console.log("seeded _form_labels backfill row");
