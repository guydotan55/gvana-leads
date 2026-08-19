import { clientConfig } from "@/client.config";
import { infobipProvider } from "./providers/infobip";
import { wasenderProvider } from "./providers/wasender";
import type { WhatsAppProvider } from "./types";

export * from "./types";

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
