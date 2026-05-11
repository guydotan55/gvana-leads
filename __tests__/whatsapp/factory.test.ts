import { getWhatsAppProvider } from "@/lib/whatsapp";

jest.mock("@/client.config", () => ({
  clientConfig: { integrations: { whatsapp: { provider: "infobip" } } },
}));

describe("getWhatsAppProvider", () => {
  beforeEach(() => jest.resetModules());

  it("returns the Infobip provider when config says infobip", () => {
    jest.doMock("@/client.config", () => ({
      clientConfig: { integrations: { whatsapp: { provider: "infobip" } } },
    }));
    const { getWhatsAppProvider } = require("@/lib/whatsapp");
    const p = getWhatsAppProvider();
    expect(p.name).toBe("infobip");
  });

  it("returns the Wasender provider when config says wasender", () => {
    jest.doMock("@/client.config", () => ({
      clientConfig: { integrations: { whatsapp: { provider: "wasender" } } },
    }));
    const { getWhatsAppProvider } = require("@/lib/whatsapp");
    const p = getWhatsAppProvider();
    expect(p.name).toBe("wasender");
  });

  it("throws on an unknown provider", () => {
    jest.doMock("@/client.config", () => ({
      clientConfig: { integrations: { whatsapp: { provider: "telegram" } } },
    }));
    const { getWhatsAppProvider } = require("@/lib/whatsapp");
    expect(() => getWhatsAppProvider()).toThrow(/Unknown WhatsApp provider/);
  });
});
