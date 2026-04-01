import { NextRequest, NextResponse } from "next/server";
import { sendCAPIEvent } from "@/lib/capi";

export async function POST(request: NextRequest) {
  try {
    const { eventName, phone, contentName, sourceUrl } = await request.json();

    if (!eventName) {
      return NextResponse.json({ error: "eventName required" }, { status: 400 });
    }

    sendCAPIEvent({
      eventName,
      phone: phone || undefined,
      sourceUrl: sourceUrl || request.headers.get("referer") || undefined,
      customData: {
        content_name: contentName || undefined,
      },
    }).catch((err) => console.error("CAPI track event failed:", err));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
