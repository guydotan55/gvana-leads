import { NextRequest, NextResponse } from "next/server";
import { appendView } from "@/lib/views-repo";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug?.trim()) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const source = body?.source === "builder" ? "builder" : "hardcoded";

    // Best-effort: never block the form UX on tracking failures.
    appendView({
      slug,
      source,
      utmSource: typeof body?.utmSource === "string" ? body.utmSource : undefined,
      utmMedium: typeof body?.utmMedium === "string" ? body.utmMedium : undefined,
      utmCampaign: typeof body?.utmCampaign === "string" ? body.utmCampaign : undefined,
      referer: request.headers.get("referer") || undefined,
    }).catch((err) => console.error("appendView failed:", err));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("form-view tracking failed:", error);
    // Always 200 so the client never retries — tracking is best-effort.
    return NextResponse.json({ ok: false });
  }
}
