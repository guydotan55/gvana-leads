import { getSheets, getSheetId, ensureTabWithHeader } from "@/lib/sheets";
import { withSheetsRetry } from "@/lib/sheets-retry";
import { isFeatureEnabled } from "@/lib/config";

const TAB = "_errors";
const HEADER = ["timestamp", "source", "key", "message", "context"];
const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1h

export function shouldSendAlert(recent: { key: string; ts: string }[], key: string, nowMs: number, windowMs: number): boolean {
  return !recent.some((r) => r.key === key && nowMs - Date.parse(r.ts) < windowMs);
}

async function recentAlerts(): Promise<{ key: string; ts: string }[]> {
  try {
    const sheets = getSheets();
    const res = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: getSheetId(), range: `'${TAB}'!A2:C` }));
    return ((res.data.values as string[][]) || []).map((r) => ({ ts: r[0] || "", key: r[2] || "" }));
  } catch { return []; }
}

async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export async function alert(key: string, message: string, context = ""): Promise<void> {
  try {
    await ensureTabWithHeader(TAB, HEADER);
    const sheets = getSheets();
    const ts = new Date().toISOString();

    // Decide the Telegram send BEFORE appending, so the row we're about to
    // write can't suppress its own alert.
    const wantTelegram = isFeatureEnabled("alerts")
      && shouldSendAlert(await recentAlerts(), key, Date.parse(ts), DEDUP_WINDOW_MS);

    await withSheetsRetry(() => sheets.spreadsheets.values.append({
      spreadsheetId: getSheetId(), range: `'${TAB}'!A1`, valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS", requestBody: { values: [[ts, "leadgen", key, message, context]] },
    }));

    if (wantTelegram) await sendTelegram(`⚠️ ${message}${context ? `\n${context}` : ""}`);
  } catch (err) {
    // alerting must never break ingestion/cron
    console.error("alert() failed:", err);
  }
}
