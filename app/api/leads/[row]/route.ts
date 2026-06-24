import { NextRequest, NextResponse } from "next/server";
import { getLeads, updateLeadCells, deleteLead, VALID_STATUSES } from "@/lib/sheets";
import { sendCAPIEvent } from "@/lib/capi";
import { isFeatureEnabled } from "@/lib/config";
import { normalizePhone } from "@/lib/phone";
import { clientConfig } from "@/client.config";
import { alert } from "@/lib/alerts";
import {
  resolveConversion,
  upsertPending as upsertConvPending,
  markDone as markConvDone,
} from "@/lib/capi-conversions";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ row: string }> }
) {
  try {
    const { row } = await params;
    const rowNum = parseInt(row, 10);
    if (!rowNum || rowNum < 1) {
      return NextResponse.json({ error: "Invalid row" }, { status: 400 });
    }

    const { status, attempts, plan, handledBy, comment, sheetTab } = await request.json();

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify lead exists
    const leads = await getLeads();
    const lead = leads.find((l) => l.row === rowNum && (!sheetTab || l.sheetTab === sheetTab));
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const updates: Record<string, string> = { status };

    if (typeof attempts === "number" && attempts >= 0) {
      updates.attempts = String(attempts);
    }

    if ((status === "under_review" || status === "accepted") && typeof plan === "string") {
      updates.plan = plan;
    }

    if (typeof handledBy === "string") {
      updates.handledBy = handledBy;
    }

    if (typeof comment === "string") {
      updates.comment = comment;
    }

    await updateLeadCells(lead.sheetTab, rowNum, updates);

    // Fire qualified/accepted CAPI conversions — guaranteed (outbox + retry),
    // correct (normalized phone, event_id, preserved event_time), config-driven.
    // Gate is `lead.leadId` (the Meta lead_id match key), NOT phone as before:
    // organic/manual leads have no lead_id → unattributable → skipped. A lead may
    // have a leadId but no phone; we still fire (lead_id alone attributes), passing
    // phone only when present. A CAPI hiccup must NEVER fail the status update —
    // the admin action is primary; we log + alert instead.
    if (isFeatureEnabled("capi") && lead.leadId) {
      const resolved = resolveConversion(
        status,
        lead,
        clientConfig.capiEvents,
        Math.floor(Date.now() / 1000)
      );
      if (resolved) {
        try {
          const payloadJson = JSON.stringify(resolved.customData);
          // `armed` is false when an existing pending/done row is left untouched —
          // a same-stage re-mark is a deduped no-op, so we do NOT re-send inline
          // (this is what keeps the inline path and the cron-retry path in sync).
          const armed = await upsertConvPending(
            lead.leadId,
            resolved.eventName,
            lead.sheetTab,
            resolved.eventTime,
            payloadJson
          );
          if (armed) {
            const ok = await sendCAPIEvent({
              eventName: resolved.eventName,
              eventId: lead.leadId,
              leadId: lead.leadId,
              phone: lead.phone ? normalizePhone(lead.phone) : undefined,
              customData: resolved.customData,
              eventTime: resolved.eventTime,
            });
            // Inline-send failure leaves the row `pending` → daily cron retries.
            if (ok) await markConvDone(lead.leadId, resolved.eventName);
          }
        } catch (err) {
          // Persistent sheet outage: no row to retry. Alerted, not auto-recovered.
          // (alert() never throws — it swallows internally — so no inner catch.)
          console.error("CAPI conversion enqueue/send failed:", err);
          await alert(
            `capi-conv-enqueue:${lead.leadId}:${resolved.eventName}`,
            `CAPI conversion failed to enqueue/send for lead ${lead.leadId} (status ${status})`,
            String(err)
          );
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Status update failed:", error);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ row: string }> }
) {
  try {
    const { row } = await params;
    const rowNum = parseInt(row, 10);
    if (!rowNum || rowNum < 1) {
      return NextResponse.json({ error: "Invalid row" }, { status: 400 });
    }

    const { sheetTab, expectedLeadId } = await request.json().catch(() => ({}));

    const leads = await getLeads();
    const lead = leads.find((l) => l.row === rowNum && (!sheetTab || l.sheetTab === sheetTab));
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (expectedLeadId && lead.leadId && lead.leadId !== expectedLeadId) {
      return NextResponse.json(
        { error: "Lead identity mismatch — refresh and try again" },
        { status: 409 }
      );
    }

    await deleteLead(lead.sheetTab, rowNum);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Lead delete failed:", error);
    return NextResponse.json(
      { error: "Failed to delete lead" },
      { status: 500 }
    );
  }
}
