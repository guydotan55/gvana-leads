import { NextRequest, NextResponse } from "next/server";
import { getForm, appendSubmission } from "@/lib/forms-repo";
import { sendCAPIEvent } from "@/lib/capi";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const form = await getForm(id);
    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }
    if (form.status !== "published") {
      return NextResponse.json({ error: "Form is not published" }, { status: 403 });
    }

    const body = await request.json();
    const { fields, utmSource, utmMedium, utmCampaign } = body || {};
    if (!fields || typeof fields !== "object") {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const fullName = String(fields.fullName || "").trim();
    const phone = String(fields.phone || "").trim();
    if (!fullName || !phone) {
      return NextResponse.json({ error: "Name and phone are required" }, { status: 400 });
    }

    // Validate required fields
    for (const field of form.fields) {
      if (!field.required) continue;
      const v = fields[field.id];
      const ok = Array.isArray(v) ? v.length > 0 : !!String(v || "").trim();
      if (!ok) {
        return NextResponse.json(
          { error: `Missing required field: ${field.label}` },
          { status: 400 }
        );
      }
    }

    const leadId = await appendSubmission(form, {
      fullName,
      phone,
      fields,
      utmSource,
      utmMedium,
      utmCampaign,
    });

    // Fire CAPI Lead event (mirrors /api/organic-lead behaviour)
    sendCAPIEvent({
      eventName: "Lead",
      phone,
      leadId,
      sourceUrl: request.headers.get("referer") || undefined,
      customData: {
        content_name: `builder_form_${form.id}`,
        campaign_name: utmCampaign || undefined,
      },
    }).catch((err) => console.error("CAPI Lead event failed:", err));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Form submission failed:", error);
    return NextResponse.json({ error: "Failed to submit" }, { status: 500 });
  }
}
