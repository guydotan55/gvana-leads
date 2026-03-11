import { NextRequest, NextResponse } from "next/server";
import { appendLead } from "@/lib/sheets";
import { normalizePhone } from "@/lib/phone";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.FB_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === "leadgen") {
          const leadData = change.value;

          const fieldData: Record<string, string> = {};
          for (const field of leadData.field_data || []) {
            fieldData[field.name] = field.values?.[0] || "";
          }

          const source = leadData.adgroup_id
            ? leadData.page_id
              ? "Facebook"
              : "Instagram"
            : "Facebook";

          await appendLead({
            name: fieldData.full_name || fieldData.first_name || "",
            phone: fieldData.phone_number
              ? normalizePhone(fieldData.phone_number)
              : "",
            email: fieldData.email || "",
            source,
            status: "new",
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Facebook webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
