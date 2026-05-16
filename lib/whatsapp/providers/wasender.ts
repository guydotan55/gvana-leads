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
import { normalizePhone } from "@/lib/phone";
import { acquireSendLock, isDailyCapReached, computeJitterMs, sleep } from "@/lib/whatsapp/pacing";
import { countSentTodayForSession } from "@/lib/whatsapp/dailyCount";

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
  if (!apiKey || !baseUrl) {
    throw new WhatsAppSendError(
      "wasender",
      "config",
      "Missing WASENDER_API_KEY / WASENDER_BASE_URL",
    );
  }
  return { apiKey, baseUrl };
}

// One Vercel deployment = one client = one Wasender session/number.
// Wasender's API has no session-id concept (the Bearer token IS the
// session credential), so pacing + daily-cap key off the client slug.
function sessionKey(): string {
  return clientConfig.slug;
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

async function sendTemplateMessage(params: SendTemplateParams): Promise<SendTemplateResult> {
  const { apiKey, baseUrl } = getConfig();
  const registry = loadRegistry();
  const entry = registry[params.templateName];
  if (!entry) {
    throw new WhatsAppSendError(
      "wasender",
      "bad_request",
      `Unknown template '${params.templateName}' in registry for client '${clientConfig.slug}'`,
    );
  }
  const text = renderBody(entry, params.placeholders);
  const to = normalizePhone(params.to).replace(/^\+/, ""); // Wasender wants digits, no '+'

  const key = sessionKey();
  const dailyCap = clientConfig.integrations.whatsapp.dailyCap ?? 60;
  if (await isDailyCapReached({ sessionId: key, cap: dailyCap, countTodayForSession: () => countSentTodayForSession(key) })) {
    throw new WhatsAppSendError(
      "wasender",
      "rate_limit",
      `Daily cap of ${dailyCap} sends reached for ${key}`,
      429,
    );
  }

  const release = await acquireSendLock(key);
  try {
    await sleep(computeJitterMs());

    const res = await fetch(`${baseUrl}/send-message`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ to, text }),
    });

    const body = await res.text();
    if (!res.ok) {
      let kind: "auth" | "rate_limit" | "session_down" | "bad_request" | "upstream" = "upstream";
      if (res.status === 401 || res.status === 403) kind = "auth";
      else if (res.status === 429) kind = "rate_limit";
      else if (/session is not connected|disconnected|not connected/i.test(body)) kind = "session_down";
      else if (res.status >= 400 && res.status < 500) kind = "bad_request";
      throw new WhatsAppSendError("wasender", kind, `Wasender error ${res.status}`, res.status, body);
    }

    let parsed: { success?: boolean; data?: { msgId?: number | string; status?: string } };
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      throw new WhatsAppSendError("wasender", "upstream", "Non-JSON response from Wasender", res.status, body);
    }
    const rawId = parsed.data?.msgId;
    if (rawId === undefined || rawId === null || rawId === "") {
      throw new WhatsAppSendError("wasender", "upstream", "Wasender returned no msgId", res.status, body);
    }
    return { messageId: String(rawId), status: parsed.data?.status ?? "in_progress" };
  } finally {
    release();
  }
}

export const wasenderProvider: WhatsAppProvider = {
  name: "wasender",
  sendTemplateMessage,
  getTemplates,
};

// Exported for tests in Task 5
export const _internals = { renderBody, loadRegistry };
