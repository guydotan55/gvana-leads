import type {
  WhatsAppProvider,
  SendTemplateParams,
  SendTemplateResult,
  WhatsAppTemplate,
} from "@/lib/whatsapp/types";
import { WhatsAppSendError } from "@/lib/whatsapp/types";
import { normalizePhone } from "@/lib/phone";

function getConfig() {
  const apiKey = process.env.INFOBIP_API_KEY;
  const baseUrl = process.env.INFOBIP_BASE_URL;
  const sender = process.env.INFOBIP_SENDER;
  if (!apiKey || !baseUrl || !sender) {
    throw new WhatsAppSendError(
      "infobip",
      "config",
      "Missing INFOBIP_API_KEY / INFOBIP_BASE_URL / INFOBIP_SENDER",
    );
  }
  return { apiKey, baseUrl, sender };
}

async function infobipFetch(path: string, options: RequestInit = {}) {
  const config = getConfig();
  const res = await fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `App ${config.apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    let kind: WhatsAppSendError["kind"];
    if (res.status === 401 || res.status === 403) {
      kind = "auth";
    } else if (res.status === 429) {
      kind = "rate_limit";
    } else if (res.status >= 400 && res.status < 500) {
      kind = "bad_request";
    } else {
      kind = "upstream";
    }
    throw new WhatsAppSendError(
      "infobip",
      kind,
      `Infobip API error ${res.status}: ${body}`,
      res.status,
      body,
    );
  }
  return res.json();
}

async function getTemplates(): Promise<WhatsAppTemplate[]> {
  const config = getConfig();
  const data = await infobipFetch(
    `/whatsapp/2/senders/${config.sender}/templates`,
  );
  return (data.templates || []).filter(
    (t: WhatsAppTemplate) => t.status === "APPROVED",
  );
}

async function sendTemplateMessage(
  params: SendTemplateParams,
): Promise<SendTemplateResult> {
  const config = getConfig();
  const to = normalizePhone(params.to);

  const body = {
    messages: [
      {
        from: params.sender || config.sender,
        to,
        content: {
          templateName: params.templateName,
          templateData: {
            body: {
              placeholders: params.placeholders,
            },
          },
          language: params.language,
        },
      },
    ],
  };

  const data = await infobipFetch("/whatsapp/1/message/template", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const message = data.messages?.[0];
  if (!message?.messageId) {
    throw new WhatsAppSendError(
      "infobip",
      "upstream",
      "Infobip returned no messageId",
      undefined,
      JSON.stringify(data),
    );
  }
  return {
    messageId: message.messageId,
    status: message.status?.name ?? "UNKNOWN",
  };
}

export const infobipProvider: WhatsAppProvider = {
  name: "infobip",
  sendTemplateMessage,
  getTemplates,
};
