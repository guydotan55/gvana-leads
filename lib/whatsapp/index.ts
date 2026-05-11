import { clientConfig } from "@/client.config";
import { infobipProvider } from "./providers/infobip";
import type { WhatsAppProvider } from "./types";

export * from "./types";

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
