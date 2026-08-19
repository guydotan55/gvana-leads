export type ProviderName = "infobip" | "wasender";

export interface SendTemplateParams {
  to: string;
  templateName: string;
  language: string;
  placeholders: string[];
  sender?: string;
}

export interface SendTemplateResult {
  messageId: string;
  status: string;
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

export interface WhatsAppProvider {
  readonly name: ProviderName;
  sendTemplateMessage(params: SendTemplateParams): Promise<SendTemplateResult>;
  getTemplates(): Promise<WhatsAppTemplate[]>;
}

export type WhatsAppErrorKind =
  | "config"
  | "auth"
  | "rate_limit"
  | "session_down"
  | "bad_request"
  | "upstream";

export class WhatsAppSendError extends Error {
  constructor(
    public readonly provider: ProviderName,
    public readonly kind: WhatsAppErrorKind,
    message: string,
    public readonly status?: number,
    public readonly upstreamBody?: string,
  ) {
    super(`[${provider}/${kind}] ${message}`);
    this.name = "WhatsAppSendError";
  }
}
