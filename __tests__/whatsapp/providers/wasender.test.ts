import { WhatsAppSendError } from "@/lib/whatsapp/types";

const SLUG = "test-client";

function setEnvs() {
  process.env.WASENDER_API_KEY = "test-key";
  process.env.WASENDER_BASE_URL = "https://www.wasenderapi.com/api";
  process.env.WASENDER_SESSION_ID = "session-1";
}

function clearEnvs() {
  delete process.env.WASENDER_API_KEY;
  delete process.env.WASENDER_BASE_URL;
  delete process.env.WASENDER_SESSION_ID;
}

jest.mock("@/client.config", () => ({
  clientConfig: {
    slug: "test-client",
    integrations: { whatsapp: { provider: "wasender" } },
  },
}));

jest.mock("fs", () => ({
  readFileSync: jest.fn(() => JSON.stringify({
    first_contact_he: { language: "he", category: "LOCAL", body: "שלום {{1}}, פנית דרך {{2}}", buttons: [] },
  })),
  existsSync: jest.fn(() => true),
}));

describe("wasenderProvider — config & registry", () => {
  beforeEach(() => { clearEnvs(); jest.resetModules(); });

  it("throws config error on missing envs", async () => {
    const { wasenderProvider } = await import("@/lib/whatsapp/providers/wasender");
    await expect(
      wasenderProvider.sendTemplateMessage({ to: "0501234567", templateName: "first_contact_he", language: "he", placeholders: ["דנה", "פייסבוק"] })
    ).rejects.toMatchObject({ name: "WhatsAppSendError", kind: "config" });
  });

  it("returns templates from the registry", async () => {
    setEnvs();
    const { wasenderProvider } = await import("@/lib/whatsapp/providers/wasender");
    const t = await wasenderProvider.getTemplates();
    expect(t).toHaveLength(1);
    expect(t[0].name).toBe("first_contact_he");
    expect(t[0].status).toBe("LOCAL");
  });

  it("throws bad_request when templateName is unknown", async () => {
    setEnvs();
    const { wasenderProvider } = await import("@/lib/whatsapp/providers/wasender");
    await expect(
      wasenderProvider.sendTemplateMessage({ to: "0501234567", templateName: "does_not_exist", language: "he", placeholders: [] })
    ).rejects.toMatchObject({ name: "WhatsAppSendError", kind: "bad_request" });
  });

  it("throws bad_request when placeholder count is wrong", async () => {
    setEnvs();
    const { wasenderProvider } = await import("@/lib/whatsapp/providers/wasender");
    await expect(
      wasenderProvider.sendTemplateMessage({ to: "0501234567", templateName: "first_contact_he", language: "he", placeholders: ["only one"] })
    ).rejects.toMatchObject({ name: "WhatsAppSendError", kind: "bad_request" });
  });
});
