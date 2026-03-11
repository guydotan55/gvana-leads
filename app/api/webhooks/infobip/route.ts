import { NextRequest, NextResponse } from "next/server";
import { getLeads, updateLeadCell } from "@/lib/sheets";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const results = body.results || [body];

    for (const result of results) {
      const messageId = result.messageId;
      const status = result.status?.name;

      if (!messageId || !status) continue;

      const leads = await getLeads();
      const lead = leads.find((l) => l.messageId === messageId);
      if (!lead) continue;

      let newStatus: string | null = null;
      if (status === "SEEN" || status === "READ") {
        newStatus = "read";
      } else if (status === "DELIVERED") {
        if (lead.status === "sent") {
          newStatus = "sent";
        }
      } else if (status === "FAILED" || status === "REJECTED") {
        newStatus = "new";
      }

      if (newStatus && newStatus !== lead.status) {
        await updateLeadCell(lead.row, "status", newStatus);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Infobip webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
