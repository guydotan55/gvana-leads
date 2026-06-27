import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/lib/config";
import { getLeads } from "@/lib/sheets";
import { sendCAPIEvent } from "@/lib/capi";
import { normalizePhone } from "@/lib/phone";
import { clientConfig } from "@/client.config";
import {
  resolveConversion,
  readAllConversions,
  appendDoneConversions,
  keyOf,
} from "@/lib/capi-conversions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QUALIFYING = ["relevant", "not_relevant_target", "accepted"];

// One-time (re-runnable) backfill: fire the CAPI conversion for every lead whose
// CURRENT status is a qualifying one (relevant/not_relevant_target → qualified_lead,
// accepted → converted_lead) but whose event was never recorded as sent — e.g.
// leads qualified before the FB token was fixed.
//
// Speed: sends events directly and records them with ONE batch write at the end
// (per-lead outbox writes timed the function out on Hobby's 60s cap). Dedup-safe:
// skips keys already `done`; Meta also dedups by event_id=leadId. Bounded by
// ?limit=N (default 40) sends per call; if the response shows `remaining > 0`, open
// the URL again until remaining is 0 (already-sent keys are skipped on re-run).
//
// Auth: NOT in middleware PUBLIC_PATHS → requires a dashboard session, so trigger
// it by opening the URL while logged into the dashboard.
export async function GET(request: NextRequest) {
  if (!isFeatureEnabled("capi")) {
    return NextResponse.json({ error: "capi feature disabled" }, { status: 400 });
  }

  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "40", 10) || 40;
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
    sent: 0,            // event accepted by Meta
    failed: 0,          // send returned false (re-run to retry)
    deduped: 0,         // already done → skipped
    skippedNoLeadId: 0, // qualifying status but organic/manual (no lead_id)
    remaining: 0,       // eligible-not-done beyond this run's limit — re-run to process
    errors: 0,
  };
  const doneRows: { leadgenId: string; eventName: string; sheetTab: string; eventTime: number; payloadJson: string }[] = [];

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
    processed++;
    doneKeys.add(key); // don't double-send if a duplicate lead row shares the key

    try {
      const ok = await sendCAPIEvent({
        eventName: resolved.eventName,
        eventId: lead.leadId,
        leadId: lead.leadId,
        phone: lead.phone ? normalizePhone(lead.phone) : undefined,
        customData: resolved.customData,
        eventTime: resolved.eventTime,
      });
      if (ok) {
        summary.sent++;
        doneRows.push({
          leadgenId: lead.leadId,
          eventName: resolved.eventName,
          sheetTab: lead.sheetTab,
          eventTime: resolved.eventTime,
          payloadJson: JSON.stringify(resolved.customData),
        });
      } else {
        summary.failed++;
      }
    } catch (err) {
      console.error(`backfill error for lead ${lead.leadId} (${resolved.eventName}):`, err);
      summary.errors++;
    }
  }

  // Single batch write of everything that sent OK.
  try {
    await appendDoneConversions(doneRows);
  } catch (err) {
    console.error("backfill: appendDoneConversions failed:", err);
    // events already reached Meta; the done-rows just didn't persist. Re-running
    // would re-send (Meta dedups), so this is recoverable, not data loss.
    return NextResponse.json({
      ok: false,
      warning: "events sent but outbox bookkeeping failed to persist; re-run is safe (Meta dedups)",
      summary,
    });
  }

  return NextResponse.json({ ok: true, summary });
}
