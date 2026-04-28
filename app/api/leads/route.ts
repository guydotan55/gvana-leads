import { NextResponse } from "next/server";
import { getLeads } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const leads = await getLeads();
    return NextResponse.json({ leads });
  } catch (error) {
    console.error("Failed to fetch leads:", error);
    const debug = {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      gApi: (error as { response?: { status?: number; data?: unknown } }).response,
      stackHead: error instanceof Error ? error.stack?.split("\n").slice(0, 6) : undefined,
    };
    return NextResponse.json({ error: "Failed to fetch leads", debug }, { status: 500 });
  }
}
