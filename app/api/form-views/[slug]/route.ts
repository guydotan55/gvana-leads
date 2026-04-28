import { NextRequest, NextResponse } from "next/server";
import { appendView } from "@/lib/views-repo";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    if (!rawSlug?.trim()) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }
    // Same defensive decoding as getForm — the Vercel edge sometimes
    // hands non-ASCII paths through still percent-encoded.
    let slug = rawSlug;
    try {
      slug = decodeURIComponent(rawSlug);
    } catch {
      // malformed encoding — fall back to literal
    }
    slug = slug.normalize("NFC");

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
