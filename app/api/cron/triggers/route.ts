import { NextRequest, NextResponse } from "next/server";
import { findPendingTriggers } from "@/lib/triggers";
import { sendTemplateMessage } from "@/lib/infobip";
import { updateLeadCells } from "@/lib/sheets";
import { sendCAPIEvent } from "@/lib/capi";
import { isFeatureEnabled } from "@/lib/config";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isFeatureEnabled("triggers")) {
    return NextResponse.json({ message: "Triggers disabled" });
  }

  try {
    const pending = await findPendingTriggers();
    const results = [];

    for (const { trigger, lead } of pending) {
      try {
        const mappingsPath = path.join(process.cwd(), "config", "template-mappings.json");
        const mappingsData = JSON.parse(await readFile(mappingsPath, "utf-8"));
        const mapping = mappingsData.mappings[trigger.template];

        if (!mapping) {
          results.push({
            leadRow: lead.row,
            error: `No mapping for template: ${trigger.template}`,
          });
          continue;
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

        const sendResult = await sendTemplateMessage({
          to: lead.phone,
          templateName: trigger.template,
          language: mapping.language || "he",
          placeholders,
          sender: trigger.sender === "default" ? undefined : trigger.sender,
        });

        await updateLeadCells(lead.row, {
          status: "sent",
          messageId: sendResult.messageId,
          lastMessage: trigger.template,
          lastMessageDate: new Date().toISOString(),
        });

        if (trigger.capi_event) {
          await sendCAPIEvent({
            eventName: trigger.capi_event,
            phone: lead.phone,
            leadId: lead.leadId,
          });
        }

        results.push({
          leadRow: lead.row,
          triggerId: trigger.id,
          messageId: sendResult.messageId,
          success: true,
        });
      } catch (err) {
        results.push({
          leadRow: lead.row,
          triggerId: trigger.id,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error("Cron trigger error:", error);
    return NextResponse.json(
      { error: "Trigger processing failed" },
      { status: 500 }
    );
  }
}
