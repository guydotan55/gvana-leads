import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/lib/config";
import { readDue, markDone, markRetry, MAX_ATTEMPTS } from "@/lib/capi-outbox";
import { getLeads } from "@/lib/sheets";
import { sendCAPIEvent } from "@/lib/capi";
import { normalizePhone } from "@/lib/phone";
import { alert } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isFeatureEnabled("capi")) return NextResponse.json({ message: "capi disabled" });

  const now = new Date();
  const nowISO = now.toISOString();
  const due = await readDue(nowISO);
  const leads = await getLeads();
  const results: { leadgenId: string; ok: boolean }[] = [];

  for (const row of due) {
    const lead = leads.find((l) => l.leadId === row.leadgenId && l.sheetTab === row.sheetTab);
    if (!lead) {
      await markRetry(row.leadgenId, MAX_ATTEMPTS, "lead/tab not found", nowISO);
      await alert(`capi-retry-missing:${row.leadgenId}`, `CAPI retry: lead ${row.leadgenId} not found in ${row.sheetTab}`);
      continue;
    }
    const phone = normalizePhone(lead.phone || "");
    const ok = await sendCAPIEvent({ eventName: "Lead", eventId: row.leadgenId, leadId: row.leadgenId, phone });
    if (ok) {
      await markDone(row.leadgenId);
    } else {
      const attempts = row.attempts + 1;
      const next = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      await markRetry(row.leadgenId, attempts, "send returned false", next);
      if (attempts >= MAX_ATTEMPTS) {
        await alert(`capi-giveup:${row.leadgenId}`, `CAPI gave up for lead ${row.leadgenId} after ${attempts} tries`);
      }
    }
    results.push({ leadgenId: row.leadgenId, ok });
  }

  return NextResponse.json({ processed: results.length, results });
}
