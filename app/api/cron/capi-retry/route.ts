import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/lib/config";
import { readDue, markDone, markRetry, MAX_ATTEMPTS } from "@/lib/capi-outbox";
import {
  readDue as readConvDue,
  markDone as markConvDone,
  markRetry as markConvRetry,
  MAX_ATTEMPTS as CONV_MAX_ATTEMPTS,
} from "@/lib/capi-conversions";
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

  // --- Second sweep: qualified/accepted conversions outbox (reuses `leads`) ---
  const convDue = await readConvDue(nowISO);
  const convResults: { leadgenId: string; eventName: string; ok: boolean }[] = [];

  for (const row of convDue) {
    const lead = leads.find((l) => l.leadId === row.leadgenId && l.sheetTab === row.sheetTab);
    if (!lead) {
      await markConvRetry(row.leadgenId, row.eventName, CONV_MAX_ATTEMPTS, "lead/tab not found", nowISO);
      await alert(
        `capi-conv-missing:${row.leadgenId}:${row.eventName}`,
        `CAPI conversion retry: lead ${row.leadgenId} not found in ${row.sheetTab}`
      );
      continue;
    }

    let customData: Record<string, unknown> = {};
    try {
      customData = row.payloadJson ? JSON.parse(row.payloadJson) : {};
    } catch (err) {
      console.error(`bad payloadJson for ${row.leadgenId}:${row.eventName}:`, err);
      customData = {};
    }

    const phone = lead.phone ? normalizePhone(lead.phone) : undefined;
    const ok = await sendCAPIEvent({
      eventName: row.eventName,
      eventId: row.leadgenId,
      leadId: row.leadgenId,
      phone,
      customData,
      eventTime: row.eventTime,
    });

    if (ok) {
      await markConvDone(row.leadgenId, row.eventName);
    } else {
      const attempts = row.attempts + 1;
      const next = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      await markConvRetry(row.leadgenId, row.eventName, attempts, "send returned false", next);
      if (attempts >= CONV_MAX_ATTEMPTS) {
        await alert(
          `capi-conv-giveup:${row.leadgenId}:${row.eventName}`,
          `CAPI conversion gave up for lead ${row.leadgenId} event ${row.eventName} after ${attempts} tries`
        );
      }
    }
    convResults.push({ leadgenId: row.leadgenId, eventName: row.eventName, ok });
  }

  return NextResponse.json({
    processed: results.length,
    results,
    convProcessed: convResults.length,
    convResults,
  });
}
