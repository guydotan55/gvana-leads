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
  leadId?: string;
  fbc?: string;
  fbp?: string;
  sourceUrl?: string;
  customData?: Record<string, unknown>;
  eventId?: string;
  eventTime?: number;
}

export async function sendCAPIEvent(params: CAPIEventParams): Promise<boolean> {
  const config = getConfig();
  if (!config) return false;

  const userData: Record<string, unknown> = {};
  if (params.phone) userData.ph = [sha256(params.phone)];
  if (params.leadId) userData.lead_id = params.leadId;
  if (params.fbc) userData.fbc = params.fbc;
  if (params.fbp) userData.fbp = params.fbp;

  // Guard against a non-positive eventTime (e.g. a corrupt/blank outbox cell that
  // parsed to 0): event_time=0 is epoch 1970, which Meta rejects as >7 days old,
  // so a damaged retry row would burn all attempts. Fall back to now in that case.
  const t = params.eventTime;
  const eventData: Record<string, unknown> = {
    event_name: params.eventName,
    event_time: typeof t === "number" && t > 0 ? t : Math.floor(Date.now() / 1000),
    action_source: "system_generated",
    user_data: userData,
  };

  if (params.eventId) {
    eventData.event_id = params.eventId;
  }

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
    const url = `https://graph.facebook.com/v21.0/${config.pixelId}/events?access_token=${config.accessToken}`;
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
