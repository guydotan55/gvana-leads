import { NextRequest, NextResponse } from "next/server";
import { getLeads } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  void request;
  try {
    const leads = await getLeads();
    const sample = leads
      .filter(l => l.sheetTab === "לידים")
      .slice(0, 20)
      .map(l => ({
        leadId: l.leadId?.slice(0, 10),
        adsetId: l.adsetId,
        adsetName: l.adsetName?.slice(0, 40),
        formName: l.formName?.slice(0, 40),
        sheetTab: l.sheetTab,
      }));
    return NextResponse.json(sample);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
