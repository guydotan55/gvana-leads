import { normalizePhone } from "./phone";

interface InfobipConfig {
  apiKey: string;
  baseUrl: string;
  sender: string;
}

function getConfig(): InfobipConfig {
  const apiKey = process.env.INFOBIP_API_KEY;
  const baseUrl = process.env.INFOBIP_BASE_URL;
  const sender = process.env.INFOBIP_SENDER;
  if (!apiKey || !baseUrl || !sender) {
    throw new Error("Infobip env vars (INFOBIP_API_KEY, INFOBIP_BASE_URL, INFOBIP_SENDER) are required");
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
    throw new Error(`Infobip API error ${res.status}: ${body}`);
  }
  return res.json();
}

export interface WhatsAppTemplate {
  name: string;
  language: string;
  status: string;
  category: string;
  structure: {
    header?: { format: string };
    body: { text: string; examples?: string[] };
    footer?: { text: string };
    buttons?: Array<{ type: string; text: string }>;
  };
}

export async function getTemplates(): Promise<WhatsAppTemplate[]> {
  const config = getConfig();
  const data = await infobipFetch(
    `/whatsapp/2/senders/${config.sender}/templates`
  );
  return (data.templates || []).filter(
    (t: WhatsAppTemplate) => t.status === "APPROVED"
  );
}

export interface SendMessageParams {
  to: string;
  templateName: string;
  language: string;
  placeholders: string[];
  sender?: string;
}

export interface SendMessageResult {
  messageId: string;
  status: string;
}

export async function sendTemplateMessage(
  params: SendMessageParams
): Promise<SendMessageResult> {
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
  return {
    messageId: message?.messageId || "",
    status: message?.status?.name || "UNKNOWN",
  };
}
