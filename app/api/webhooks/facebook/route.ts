import { NextRequest, NextResponse } from "next/server";

// Webhook verification for Facebook Lead Ads.
// Leads arrive in the Google Sheet via Zapier/automation, not through this webhook.
// This endpoint only handles the verification handshake.

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

export async function POST() {
  // Leads are ingested via Zapier into the Google Sheet directly.
  // This endpoint is kept for potential future use.
  return NextResponse.json({ success: true });
}
