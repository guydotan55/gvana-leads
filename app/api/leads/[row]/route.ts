import { NextRequest, NextResponse } from "next/server";
import { getLeads, updateLeadCells, VALID_STATUSES } from "@/lib/sheets";
import { sendCAPIEvent } from "@/lib/capi";

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

    const { status, attempts, plan, handledBy, sheetTab } = await request.json();

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

    await updateLeadCells(lead.sheetTab, rowNum, updates);

    // Fire CAPI events on meaningful status changes
    if ((status === "relevant" || status === "not_relevant_target") && lead.phone) {
      sendCAPIEvent({
        eventName: "CompleteRegistration",
        phone: lead.phone,
        leadId: lead.leadId,
        customData: {
          content_name: status === "relevant" ? "lead_relevant" : "lead_not_relevant_target",
          campaign_name: lead.campaignName || undefined,
        },
      }).catch((err) => console.error("CAPI CompleteRegistration event failed:", err));
    }

    if (status === "accepted" && lead.phone) {
      sendCAPIEvent({
        eventName: "Purchase",
        phone: lead.phone,
        leadId: lead.leadId,
        customData: {
          content_name: "lead_accepted",
          campaign_name: lead.campaignName || undefined,
        },
      }).catch((err) => console.error("CAPI Purchase event failed:", err));
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
