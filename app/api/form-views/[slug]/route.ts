import { NextRequest, NextResponse } from "next/server";
import { appendView } from "@/lib/views-repo";

export const dynamic = "force-dynamic";

const VISITOR_COOKIE = "gvana_vid";
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function generateVisitorId(): string {
  // Server-side UUID v4 — uses crypto.randomUUID when available, falls
  // back to a timestamp+random for older runtimes.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 14);
  return `${t}-${r}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    if (!rawSlug?.trim()) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }
    let slug = rawSlug;
    try {
      slug = decodeURIComponent(rawSlug);
    } catch {
      // malformed encoding — fall back to literal
    }
    slug = slug.normalize("NFC");

    // Resolve a stable visitor id. Read the cookie if present;
    // otherwise mint one and set it on the response. Either way we
    // record THIS view against the resolved id so the very first
    // visit and subsequent ones from the same browser dedupe.
    const existingVid = request.cookies.get(VISITOR_COOKIE)?.value?.trim();
    const visitorId = existingVid && existingVid.length > 0 ? existingVid : generateVisitorId();
    const isNewVisitor = visitorId !== existingVid;

    const body = await request.json().catch(() => ({}));
    const source = body?.source === "builder" ? "builder" : "hardcoded";

    appendView({
      slug,
      source,
      utmSource: typeof body?.utmSource === "string" ? body.utmSource : undefined,
      utmMedium: typeof body?.utmMedium === "string" ? body.utmMedium : undefined,
      utmCampaign: typeof body?.utmCampaign === "string" ? body.utmCampaign : undefined,
      referer: request.headers.get("referer") || undefined,
      visitorId,
    }).catch((err) => console.error("appendView failed:", err));

    const res = NextResponse.json({ ok: true });
    if (isNewVisitor) {
      res.cookies.set(VISITOR_COOKIE, visitorId, {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: VISITOR_COOKIE_MAX_AGE,
      });
    }
    return res;
  } catch (error) {
    console.error("form-view tracking failed:", error);
    return NextResponse.json({ ok: false });
  }
}
