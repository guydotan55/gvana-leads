import { createHash } from "crypto";
import { isFeatureEnabled } from "./config";

interface CAPIConfig {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
}

function getConfig(): CAPIConfig | null {
  if (!isFeatureEnabled("capi")) return null;

  const pixelId = process.env.FB_PIXEL_ID;
  const accessToken = process.env.FB_ACCESS_TOKEN;
  if (!pixelId || !accessToken) return null;

  return {
    pixelId,
    accessToken,
    testEventCode: process.env.FB_TEST_EVENT_CODE,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

interface CAPIEventParams {
  eventName: string;
  phone?: string;
  email?: string;
  fbc?: string;
  fbp?: string;
  sourceUrl?: string;
  customData?: Record<string, unknown>;
}

export async function sendCAPIEvent(params: CAPIEventParams): Promise<boolean> {
  const config = getConfig();
  if (!config) return false;

  const userData: Record<string, unknown> = {};
  if (params.phone) userData.ph = [sha256(params.phone)];
  if (params.email) userData.em = [sha256(params.email)];
  if (params.fbc) userData.fbc = params.fbc;
  if (params.fbp) userData.fbp = params.fbp;

  const eventData: Record<string, unknown> = {
    event_name: params.eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: "system_generated",
    user_data: userData,
  };

  if (params.sourceUrl) {
    eventData.event_source_url = params.sourceUrl;
  }

  if (params.customData) {
    eventData.custom_data = params.customData;
  }

  const body: Record<string, unknown> = {
    data: [eventData],
  };

  if (config.testEventCode) {
    body.test_event_code = config.testEventCode;
  }

  try {
    const url = `https://graph.facebook.com/v18.0/${config.pixelId}/events?access_token=${config.accessToken}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error("CAPI error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("CAPI request failed:", error);
    return false;
  }
}
