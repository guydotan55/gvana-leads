import fs from "fs";
import path from "path";
import type {
  WhatsAppProvider,
  SendTemplateParams,
  SendTemplateResult,
  WhatsAppTemplate,
} from "@/lib/whatsapp/types";
import { WhatsAppSendError } from "@/lib/whatsapp/types";
import { clientConfig } from "@/client.config";

interface RegistryEntry {
  language: string;
  category: string;
  body: string;
  buttons?: Array<{ type: string; text: string }>;
}
type Registry = Record<string, RegistryEntry>;

function getConfig() {
  const apiKey = process.env.WASENDER_API_KEY;
  const baseUrl = process.env.WASENDER_BASE_URL;
  const sessionId = process.env.WASENDER_SESSION_ID;
  if (!apiKey || !baseUrl || !sessionId) {
    throw new WhatsAppSendError(
      "wasender",
      "config",
      "Missing WASENDER_API_KEY / WASENDER_BASE_URL / WASENDER_SESSION_ID",
    );
  }
  return { apiKey, baseUrl, sessionId };
}

function loadRegistry(): Registry {
  const slug = clientConfig.slug;
  const registryPath = path.join(process.cwd(), "config", `wasender-templates.${slug}.json`);
  if (!fs.existsSync(registryPath)) {
    throw new WhatsAppSendError(
      "wasender",
      "config",
      `Missing template registry at ${registryPath}`,
    );
  }
  try {
    return JSON.parse(fs.readFileSync(registryPath, "utf-8")) as Registry;
  } catch (err) {
    throw new WhatsAppSendError("wasender", "config", `Registry parse error: ${String(err)}`);
  }
}

function renderBody(template: RegistryEntry, placeholders: string[]): string {
  const required = (template.body.match(/\{\{\d+\}\}/g) ?? []).length;
  if (required !== placeholders.length) {
    throw new WhatsAppSendError(
      "wasender",
      "bad_request",
      `Template expects ${required} placeholder(s), got ${placeholders.length}`,
    );
  }
  return template.body.replace(/\{\{(\d+)\}\}/g, (_m, n) => placeholders[Number(n) - 1] ?? "");
}

async function getTemplates(): Promise<WhatsAppTemplate[]> {
  getConfig(); // throws on missing env, even for the templates list
  const registry = loadRegistry();
  return Object.entries(registry).map(([name, entry]) => ({
    name,
    language: entry.language,
    status: "LOCAL",
    category: entry.category,
    structure: {
      body: { text: entry.body },
      ...(entry.buttons && entry.buttons.length ? { buttons: entry.buttons } : {}),
    },
  }));
}

async function sendTemplateMessage(_params: SendTemplateParams): Promise<SendTemplateResult> {
  getConfig();
  const registry = loadRegistry();
  const entry = registry[_params.templateName];
  if (!entry) {
    throw new WhatsAppSendError(
      "wasender",
      "bad_request",
      `Unknown template '${_params.templateName}' in registry for client '${clientConfig.slug}'`,
    );
  }
  // Validate placeholder count even before HTTP call
  renderBody(entry, _params.placeholders);
  // HTTP send is implemented in Task 5
  throw new WhatsAppSendError("wasender", "upstream", "send not yet wired — Task 5");
}

export const wasenderProvider: WhatsAppProvider = {
  name: "wasender",
  sendTemplateMessage,
  getTemplates,
};

// Exported for tests in Task 5
export const _internals = { renderBody, loadRegistry };
