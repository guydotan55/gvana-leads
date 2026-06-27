import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/lib/config";
import { getLeads } from "@/lib/sheets";
import { sendCAPIEvent } from "@/lib/capi";
import { normalizePhone } from "@/lib/phone";
import { clientConfig } from "@/client.config";
import {
  resolveConversion,
  upsertPending as upsertConvPending,
  markDone as markConvDone,
  readAllConversions,
  keyOf,
} from "@/lib/capi-conversions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QUALIFYING = ["relevant", "not_relevant_target", "accepted"];

// One-time (re-runnable) backfill: fire the CAPI conversion for every lead whose
// CURRENT status is a qualifying one (relevant/not_relevant_target → qualified_lead,
// accepted → converted_lead) but whose event was never successfully sent — e.g.
// leads qualified before the FB token was fixed.
//
// Dedup-safe: skips keys already marked `done` (no double-count; event_id=leadId is
// Meta's second guard). (Re)sends keys with no row OR a stuck `pending` row, so it
// also clears the failed-inline backlog without depending on the daily cron.
//
// Auth: this path is NOT in middleware's PUBLIC_PATHS, so it requires a dashboard
// session — trigger it by opening the URL while logged into the dashboard.
// Bounded by ?limit=N (default 25) sends per call so it can't time out; if the
// response shows `remaining > 0`, just open it again until remaining is 0.
export async function GET(request: NextRequest) {
  if (!isFeatureEnabled("capi")) {
    return NextResponse.json({ error: "capi feature disabled" }, { status: 400 });
  }

  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "25", 10) || 25;
  const nowSec = Math.floor(Date.now() / 1000);

  const leads = await getLeads();
  const doneKeys = new Set(
    (await readAllConversions())
      .filter((r) => r.status === "done")
      .map((r) => keyOf(r.leadgenId, r.eventName))
  );

  const summary = {
    totalLeads: leads.length,
    eligible: 0,        // qualifying status + non-empty leadId
    sent: 0,            // inline send ok → done
    queued: 0,          // armed but send returned false → left pending
    deduped: 0,         // already done → skipped
    skippedNoLeadId: 0, // qualifying status but organic/manual (no lead_id)
    remaining: 0,       // eligible-not-done beyond this run's limit — re-run to process
    errors: 0,
  };
  const fired: { row: number; sheetTab: string; leadId: string; event: string; ok: boolean }[] = [];

  let processed = 0;
  for (const lead of leads) {
    const resolved = resolveConversion(lead.status, lead, clientConfig.capiEvents, clientConfig.capiCrm, nowSec);
    if (!resolved) {
      if (!lead.leadId && QUALIFYING.includes(lead.status)) summary.skippedNoLeadId++;
      continue;
    }
    summary.eligible++;

    const key = keyOf(lead.leadId, resolved.eventName);
    if (doneKeys.has(key)) {
      summary.deduped++;
      continue;
    }
    if (processed >= limit) {
      summary.remaining++;
      continue;
    }

    try {
      await upsertConvPending(
        lead.leadId,
        resolved.eventName,
        lead.sheetTab,
        resolved.eventTime,
        JSON.stringify(resolved.customData)
      );
      const ok = await sendCAPIEvent({
        eventName: resolved.eventName,
        eventId: lead.leadId,
        leadId: lead.leadId,
        phone: lead.phone ? normalizePhone(lead.phone) : undefined,
        customData: resolved.customData,
        eventTime: resolved.eventTime,
      });
      if (ok) {
        await markConvDone(lead.leadId, resolved.eventName);
        summary.sent++;
      } else {
        summary.queued++;
      }
      fired.push({ row: lead.row, sheetTab: lead.sheetTab, leadId: lead.leadId, event: resolved.eventName, ok });
    } catch (err) {
      console.error(`backfill error for lead ${lead.leadId} (${resolved.eventName}):`, err);
      summary.errors++;
    }
    processed++;
    doneKeys.add(key); // don't double-send if a duplicate lead row shares the key
  }

  return NextResponse.json({ ok: true, summary, fired });
}
