import { NextRequest, NextResponse } from "next/server";
import { sendTemplateMessage } from "@/lib/infobip";
import { getLeads, updateLeadCells } from "@/lib/sheets";
import { sendCAPIEvent } from "@/lib/capi";
import { readFile } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const { leadRow, templateName, language, sender } = await request.json();

    if (!leadRow || !templateName) {
      return NextResponse.json(
        { error: "leadRow and templateName are required" },
        { status: 400 }
      );
    }

    const leads = await getLeads();
    const lead = leads.find((l) => l.row === leadRow);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const mappingsPath = path.join(process.cwd(), "config", "template-mappings.json");
    const mappingsData = JSON.parse(await readFile(mappingsPath, "utf-8"));
    const mapping = mappingsData.mappings[templateName];

    if (!mapping) {
      return NextResponse.json(
        { error: "No variable mapping found for this template" },
        { status: 400 }
      );
    }

    const placeholders: string[] = [];
    const sortedKeys = Object.keys(mapping.placeholders).sort(
      (a, b) => Number(a) - Number(b)
    );
    for (const key of sortedKeys) {
      const columnKey = mapping.placeholders[key];
      const value = lead[columnKey as keyof typeof lead] || "";
      placeholders.push(String(value));
    }

    const result = await sendTemplateMessage({
      to: lead.phone,
      templateName,
      language: language || mapping.language || "he",
      placeholders,
      sender,
    });

    const now = new Date().toISOString();
    await updateLeadCells(lead.sheetTab, lead.row, {
      status: "sent",
      messageId: result.messageId,
      lastMessage: templateName,
      lastMessageDate: now,
    });

    sendCAPIEvent({
      eventName: "Lead",
      phone: lead.phone,
      leadId: lead.leadId,
    }).catch((err) => console.error("CAPI Lead event failed:", err));

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      status: result.status,
    });
  } catch (error) {
    console.error("Failed to send message:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
