import { NextRequest, NextResponse } from "next/server";
import { getLeads, updateLeadCells } from "@/lib/sheets";
import { sendCAPIEvent } from "@/lib/capi";

export async function POST(request: NextRequest) {
  try {
    const { leadRow, sendFollowUp, templateName } = await request.json();

    if (!leadRow) {
      return NextResponse.json(
        { error: "leadRow is required" },
        { status: 400 }
      );
    }

    const leads = await getLeads();
    const lead = leads.find((l) => l.row === leadRow);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const results = await Promise.allSettled([
      updateLeadCells(lead.sheetTab, lead.row, {
        status: "qualified",
      }),

      sendFollowUp && templateName
        ? fetch(new URL("/api/messages/send", request.url), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadRow, templateName }),
          })
        : Promise.resolve(null),

      sendCAPIEvent({
        eventName: "Purchase",
        phone: lead.phone,
        leadId: lead.leadId,
        customData: lead.campaignName
          ? { campaign_name: lead.campaignName }
          : undefined,
      }),
    ]);

    const errors = results
      .filter((r) => r.status === "rejected")
      .map((r) => (r as PromiseRejectedResult).reason?.message || "Unknown error");

    return NextResponse.json({
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Qualify failed:", error);
    return NextResponse.json(
      { error: "Failed to qualify lead" },
      { status: 500 }
    );
  }
}
