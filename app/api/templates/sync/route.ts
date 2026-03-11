import { NextResponse } from "next/server";
import { getTemplates } from "@/lib/infobip";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const templates = await getTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Failed to sync templates:", error);
    return NextResponse.json(
      { error: "Failed to sync templates from Infobip" },
      { status: 500 }
    );
  }
}
