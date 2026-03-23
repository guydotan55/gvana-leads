import { NextRequest, NextResponse } from "next/server";
import { getLeads, updateLeadCells, VALID_STATUSES } from "@/lib/sheets";

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

    const { status, attempts, plan, sheetTab } = await request.json();

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

    if (status === "unavailable" && typeof attempts === "number" && attempts >= 0) {
      updates.attempts = String(attempts);
    }

    if (status === "accepted" && typeof plan === "string" && plan) {
      updates.plan = plan;
    }

    await updateLeadCells(lead.sheetTab, rowNum, updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Status update failed:", error);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 }
    );
  }
}
