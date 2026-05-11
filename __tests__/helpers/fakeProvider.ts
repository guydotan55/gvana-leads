import type { WhatsAppProvider, WhatsAppTemplate } from "@/lib/whatsapp/types";

export function makeFakeProvider(overrides?: Partial<WhatsAppProvider>): WhatsAppProvider {
  return {
    name: "infobip",
    sendTemplateMessage: jest.fn().mockResolvedValue({ messageId: "fake-1", status: "PENDING" }),
    getTemplates: jest.fn().mockResolvedValue([] as WhatsAppTemplate[]),
    ...overrides,
  };
}
