import { getLeads } from "@/lib/sheets";

/**
 * Counts today's outbound sends for a given Wasender session by scanning
 * the leads sheet. Treats any row whose `sent_at` (mapped to `lastMessageDate`)
 * falls within the current UTC day as a hit.
 *
 * Fallback: the Lead schema has no `wa_session_id` column (v1 Sheet layout).
 * In that case we count all rows with `lastMessageDate` set today for the
 * entire client and log a console.warn once per process. We never silently
 * return 0 — that would allow the daily cap to be bypassed.
 */

let _warnedOnce = false;

export async function countSentTodayForSession(sessionId: string): Promise<number> {
  const rows = await getLeads();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

  // The Lead interface does not carry a wa_session_id field (v1 Sheet layout).
  // Fall back to counting ALL sends today for this client (conservative: may
  // over-count when multiple sessions exist, but never under-counts).
  if (!_warnedOnce) {
    console.warn(
      "[wasender/dailyCount] no wa_session_id column in Lead schema; " +
        "falling back to per-client count (session: " +
        sessionId +
        ")"
    );
    _warnedOnce = true;
  }

  let count = 0;
  for (const row of rows) {
    const sentAt = row.lastMessageDate;
    if (!sentAt) continue;
    if (typeof sentAt !== "string") continue;
    if (sentAt.slice(0, 10) === today) count++;
  }
  return count;
}

/** Reset the "warned once" flag — for tests only. */
export function _resetWarnFlag(): void {
  _warnedOnce = false;
}
