import { NextResponse } from "next/server";
import { getWhatsAppProvider } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const templates = await getWhatsAppProvider().getTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Failed to sync templates:", error);
    return NextResponse.json(
      { error: "Failed to sync templates from Infobip" },
      { status: 500 }
    );
  }
}
