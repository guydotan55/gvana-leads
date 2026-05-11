import { clientConfig } from "@/client.config";
import type { WhatsAppProvider } from "./types";

export * from "./types";

// Stubs only — real implementations land in later tasks.
const infobipProvider: WhatsAppProvider = {
  name: "infobip",
  async sendTemplateMessage() { throw new Error("infobip provider not yet implemented"); },
  async getTemplates() { throw new Error("infobip provider not yet implemented"); },
};

const wasenderProvider: WhatsAppProvider = {
  name: "wasender",
  async sendTemplateMessage() { throw new Error("wasender provider not yet implemented"); },
  async getTemplates() { throw new Error("wasender provider not yet implemented"); },
};

export function getWhatsAppProvider(): WhatsAppProvider {
  const choice = clientConfig.integrations.whatsapp.provider;
  switch (choice) {
    case "infobip":  return infobipProvider;
    case "wasender": return wasenderProvider;
    default: {
      const _exhaustive: never = choice;
      throw new Error(`Unknown WhatsApp provider: ${_exhaustive as string}`);
    }
  }
}
