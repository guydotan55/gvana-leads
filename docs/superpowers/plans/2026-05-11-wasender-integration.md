# Wasender Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Wasender as a second outbound WhatsApp provider behind a small `WhatsAppProvider` interface, selected per-client via `client.config.ts`. Mechinat Gvana stays on Infobip with zero behavior change.

**Architecture:** New `lib/whatsapp/` module exposes a `WhatsAppProvider` interface; the factory reads `clientConfig.integrations.whatsapp.provider` and returns Infobip or Wasender. Wasender renders messages from a local per-client JSON template registry and is gated by a `pacing.ts` module enforcing 15–45 s jitter, per-session concurrency, and a configurable daily cap.

**Tech Stack:** Next.js 14 (App Router), TypeScript 5, Jest 29 + `next/jest`, Google Sheets API, Infobip REST API, Wasender REST API.

**Spec:** `docs/superpowers/specs/2026-05-11-wasender-integration-design.md`

---

## File Map

| Path | Action | Responsibility |
|---|---|---|
| `lib/whatsapp/types.ts` | Create | Provider interface, params, results, `WhatsAppSendError` |
| `lib/whatsapp/index.ts` | Create | `getWhatsAppProvider()` factory + re-exports |
| `lib/whatsapp/pacing.ts` | Create | Jitter, concurrency lock, daily-cap check |
| `lib/whatsapp/providers/infobip.ts` | Create (move) | Infobip implementation of `WhatsAppProvider` |
| `lib/whatsapp/providers/wasender.ts` | Create | Wasender implementation of `WhatsAppProvider` |
| `lib/infobip.ts` | Delete (in Task 3) | Replaced by `lib/whatsapp/providers/infobip.ts` |
| `client.config.ts` | Modify | Add `integrations.whatsapp` schema + defaults |
| `app/api/messages/send/route.ts` | Modify | Switch import to `@/lib/whatsapp` |
| `app/api/cron/triggers/route.ts` | Modify | Switch import + slice pending leads to `batchSize` |
| `app/api/templates/sync/route.ts` | Modify | Switch import to `@/lib/whatsapp` |
| `components/TemplateManager.tsx` | Modify | Switch `WhatsAppTemplate` type import |
| `config/wasender-templates.<slug>.json` | Create (per Wasender client) | Local template body registry |
| `.env.local.example` | Modify (if exists) or Create | Document new `WASENDER_*` env vars |
| `jest.config.ts` | Create | `next/jest` preset |
| `__tests__/whatsapp/factory.test.ts` | Create | Tests for `getWhatsAppProvider()` |
| `__tests__/whatsapp/pacing.test.ts` | Create | Tests for pacing module |
| `__tests__/whatsapp/providers/wasender.test.ts` | Create | Tests for Wasender provider |
| `__tests__/helpers/fakeProvider.ts` | Create | Reusable test helper |
| `package.json` | Modify | Add `test` script + jest devDeps |

Files explicitly **untouched**: `lib/capi.ts`, `lib/phone.ts`, `lib/triggers.ts`, `lib/sheets.ts`. CAPI stays provider-agnostic per spec §7.

---

## Task 0: Jest Scaffolding

**Files:**
- Create: `jest.config.ts`
- Modify: `package.json`
- Create: `__tests__/smoke.test.ts`

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
cd "$(git rev-parse --show-toplevel)"
npm install --save-dev jest@^29 @types/jest@^29 jest-environment-jsdom@^29 ts-node@^10
```

Expected: dependencies added, no errors. (`next/jest` is bundled with Next.js 14, no separate install.)

- [ ] **Step 2: Create `jest.config.ts`**

Write `jest.config.ts`:
```ts
import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/", "/__tests__/helpers/"],
};

export default createJestConfig(config);
```

- [ ] **Step 3: Add `test` script to `package.json`**

In `package.json` `scripts`, add:
```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 4: Write the smoke test**

Write `__tests__/smoke.test.ts`:
```ts
describe("test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run the smoke test**

Run:
```bash
npm test
```

Expected: 1 passing test. No type errors.

- [ ] **Step 6: Commit**

```bash
git add jest.config.ts package.json package-lock.json __tests__/smoke.test.ts
git commit -m "chore(test): add jest + next/jest scaffolding

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 1: Type Definitions

**Files:**
- Create: `lib/whatsapp/types.ts`
- Create: `__tests__/whatsapp/types.test.ts`

- [ ] **Step 1: Write the failing test**

Write `__tests__/whatsapp/types.test.ts`:
```ts
import { WhatsAppSendError } from "@/lib/whatsapp/types";

describe("WhatsAppSendError", () => {
  it("formats provider + kind in the message", () => {
    const err = new WhatsAppSendError("wasender", "session_down", "WhatsApp Web unlinked");
    expect(err.message).toBe("[wasender/session_down] WhatsApp Web unlinked");
    expect(err.name).toBe("WhatsAppSendError");
    expect(err.provider).toBe("wasender");
    expect(err.kind).toBe("session_down");
  });

  it("carries optional status and upstreamBody", () => {
    const err = new WhatsAppSendError("infobip", "auth", "Invalid API key", 401, '{"requestError":...}');
    expect(err.status).toBe(401);
    expect(err.upstreamBody).toBe('{"requestError":...}');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- __tests__/whatsapp/types.test.ts`
Expected: FAIL — cannot find module `@/lib/whatsapp/types`.

- [ ] **Step 3: Write `lib/whatsapp/types.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- __tests__/whatsapp/types.test.ts`
Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/whatsapp/types.ts __tests__/whatsapp/types.test.ts
git commit -m "feat(whatsapp): add provider interface + error types

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 2: Factory + Config Schema

**Files:**
- Modify: `client.config.ts`
- Create: `lib/whatsapp/index.ts`
- Create: `__tests__/whatsapp/factory.test.ts`
- Create: `__tests__/helpers/fakeProvider.ts`

- [ ] **Step 1: Update `client.config.ts` schema**

In `client.config.ts`, find the `ClientConfig` interface's `integrations` block and add a `whatsapp` field:

Replace the existing `integrations` interface definition with:
```ts
integrations: {
  whatsapp: {
    provider: "infobip" | "wasender";
    batchSize?: number;     // Wasender only. Cron processes this many leads per tick. Default 8.
    dailyCap?: number;      // Wasender only. Hard ceiling on outbound per session per day. Default 60 (warm-up).
  };
  infobip: { enabled: boolean };
  capi: { enabled: boolean };
  sheets: { enabled: boolean };
};
```

In the same file, update the `clientConfig` constant's `integrations` block to:
```ts
integrations: {
  whatsapp: { provider: "infobip" },
  infobip: { enabled: true },
  capi: { enabled: true },
  sheets: { enabled: true },
},
```

This preserves Mechinat Gvana's behavior — Infobip remains the only provider in use.

- [ ] **Step 2: Create `__tests__/helpers/fakeProvider.ts`**

```ts
import type { WhatsAppProvider, WhatsAppTemplate } from "@/lib/whatsapp/types";

export function makeFakeProvider(overrides?: Partial<WhatsAppProvider>): WhatsAppProvider {
  return {
    name: "infobip",
    sendTemplateMessage: jest.fn().mockResolvedValue({ messageId: "fake-1", status: "PENDING" }),
    getTemplates: jest.fn().mockResolvedValue([] as WhatsAppTemplate[]),
    ...overrides,
  };
}
```

- [ ] **Step 3: Write the failing factory test**

Write `__tests__/whatsapp/factory.test.ts`:
```ts
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- __tests__/whatsapp/factory.test.ts`
Expected: FAIL — cannot find module `@/lib/whatsapp`.

- [ ] **Step 5: Create `lib/whatsapp/index.ts` with stub providers**

```ts
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
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- __tests__/whatsapp/factory.test.ts`
Expected: 3 passing tests.

- [ ] **Step 7: Run a typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. Confirms the `client.config.ts` schema change is internally consistent.

- [ ] **Step 8: Commit**

```bash
git add client.config.ts lib/whatsapp/index.ts __tests__/whatsapp/factory.test.ts __tests__/helpers/fakeProvider.ts
git commit -m "feat(whatsapp): factory + client.config schema

Provider selection driven by integrations.whatsapp.provider in
client.config.ts. Stub provider implementations land in subsequent tasks.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 3: Move Infobip Behind the Interface

**Files:**
- Read first: `lib/infobip.ts` (existing)
- Create: `lib/whatsapp/providers/infobip.ts`
- Delete: `lib/infobip.ts`
- Modify: `app/api/messages/send/route.ts`
- Modify: `app/api/cron/triggers/route.ts`
- Modify: `app/api/templates/sync/route.ts`
- Modify: `components/TemplateManager.tsx`

Per project CLAUDE.md ("tests for your own changes only"), no new unit tests for Infobip — it's a move, not a behavior change. Build + manual smoke is the verification.

- [ ] **Step 1: Read the existing `lib/infobip.ts`**

Run: open `lib/infobip.ts` in your editor (or `cat lib/infobip.ts`). Note the exports: `WhatsAppTemplate`, `getTemplates`, `SendMessageParams`, `SendMessageResult`, `sendTemplateMessage`. You will preserve their behavior exactly while wrapping in the new interface.

- [ ] **Step 2: Create `lib/whatsapp/providers/infobip.ts`**

```ts
import type {
  WhatsAppProvider,
  SendTemplateParams,
  SendTemplateResult,
  WhatsAppTemplate,
} from "@/lib/whatsapp/types";
import { WhatsAppSendError } from "@/lib/whatsapp/types";
import { normalizePhone } from "@/lib/phone";

function getConfig() {
  const apiKey = process.env.INFOBIP_API_KEY;
  const baseUrl = process.env.INFOBIP_BASE_URL;
  const sender = process.env.INFOBIP_SENDER;
  if (!apiKey || !baseUrl || !sender) {
    throw new WhatsAppSendError(
      "infobip",
      "config",
      "Missing INFOBIP_API_KEY / INFOBIP_BASE_URL / INFOBIP_SENDER",
    );
  }
  return { apiKey, baseUrl, sender };
}

async function infobipFetch(path: string, init: RequestInit) {
  const { apiKey, baseUrl } = getConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `App ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let kind: "auth" | "rate_limit" | "bad_request" | "upstream" = "upstream";
    if (res.status === 401 || res.status === 403) kind = "auth";
    else if (res.status === 429) kind = "rate_limit";
    else if (res.status >= 400 && res.status < 500) kind = "bad_request";
    throw new WhatsAppSendError("infobip", kind, `${res.status} ${res.statusText}`, res.status, text);
  }
  return text ? JSON.parse(text) : {};
}

async function getTemplates(): Promise<WhatsAppTemplate[]> {
  const { sender } = getConfig();
  const data = await infobipFetch(`/whatsapp/2/senders/${sender}/templates`, { method: "GET" });
  return (data.templates ?? []).filter((t: WhatsAppTemplate) => t.status === "APPROVED");
}

async function sendTemplateMessage(params: SendTemplateParams): Promise<SendTemplateResult> {
  const { sender } = getConfig();
  const to = normalizePhone(params.to);
  const body = {
    messages: [
      {
        from: params.sender || sender,
        to,
        content: {
          templateName: params.templateName,
          templateData: { body: { placeholders: params.placeholders } },
          language: params.language,
        },
      },
    ],
  };
  const data = await infobipFetch("/whatsapp/1/message/template", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const msg = data.messages?.[0];
  if (!msg?.messageId) {
    throw new WhatsAppSendError("infobip", "upstream", "Infobip returned no messageId", undefined, JSON.stringify(data));
  }
  return { messageId: msg.messageId, status: msg.status?.name ?? "UNKNOWN" };
}

export const infobipProvider: WhatsAppProvider = {
  name: "infobip",
  sendTemplateMessage,
  getTemplates,
};
```

> **Note for implementer:** The exact shape of the Infobip request/response is defined by the existing `lib/infobip.ts`. If anything differs from the code above (e.g., the templates endpoint path, the `templateData` structure), **preserve the existing behavior** — this task is a move, not a redesign. Diff against `lib/infobip.ts` before deleting it.

- [ ] **Step 3: Update `lib/whatsapp/index.ts` to use the real Infobip provider**

Replace the stub `infobipProvider` declaration in `lib/whatsapp/index.ts` with an import:
```ts
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
```

- [ ] **Step 4: Update `app/api/messages/send/route.ts`**

Find the import of `sendTemplateMessage` from `@/lib/infobip` and replace it. Read the existing call site at roughly line 46, then:

Replace:
```ts
import { sendTemplateMessage } from "@/lib/infobip";
```
With:
```ts
import { getWhatsAppProvider } from "@/lib/whatsapp";
```

Replace the send call (around line 46-52):
```ts
const result = await sendTemplateMessage({ /* ... */ });
```
With:
```ts
const wa = getWhatsAppProvider();
const result = await wa.sendTemplateMessage({ /* same params */ });
```

If the existing code imports `WhatsAppTemplate` or other types from `@/lib/infobip`, change the import path to `@/lib/whatsapp`.

- [ ] **Step 5: Update `app/api/cron/triggers/route.ts`**

Same substitution as Step 4 — the call site is around line 51. Replace the `@/lib/infobip` import with `@/lib/whatsapp` and the direct `sendTemplateMessage(...)` call with `getWhatsAppProvider().sendTemplateMessage(...)`.

- [ ] **Step 6: Update `app/api/templates/sync/route.ts`**

Replace:
```ts
import { getTemplates } from "@/lib/infobip";
```
With:
```ts
import { getWhatsAppProvider } from "@/lib/whatsapp";
```

Replace the call (around line 7-17):
```ts
const templates = await getTemplates();
```
With:
```ts
const templates = await getWhatsAppProvider().getTemplates();
```

- [ ] **Step 7: Update `components/TemplateManager.tsx`**

Replace:
```ts
import type { WhatsAppTemplate } from "@/lib/infobip";
```
With:
```ts
import type { WhatsAppTemplate } from "@/lib/whatsapp";
```

- [ ] **Step 8: Delete the old `lib/infobip.ts`**

Run:
```bash
git rm lib/infobip.ts
```

- [ ] **Step 9: Build to verify no broken imports**

Run:
```bash
npx tsc --noEmit && npm run build
```

Expected: typecheck passes, Next.js build succeeds. If any file still imports from `@/lib/infobip`, the build fails — fix that import and re-run.

- [ ] **Step 10: Run all tests**

Run: `npm test`
Expected: all green (the factory test now hits the real Infobip provider singleton, no behavior change).

- [ ] **Step 11: Commit**

```bash
git add -A lib/whatsapp/providers/infobip.ts lib/whatsapp/index.ts app/api/messages/send/route.ts app/api/cron/triggers/route.ts app/api/templates/sync/route.ts components/TemplateManager.tsx
git rm -f lib/infobip.ts
git commit -m "refactor(whatsapp): move Infobip behind WhatsAppProvider interface

No behavior change for Mechinat Gvana — same envs, same payload,
same messageId round-trip, same CAPI events. Three call sites updated
to import from @/lib/whatsapp instead of @/lib/infobip.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 4: Wasender Provider — Config + Template Registry

**Files:**
- Create: `lib/whatsapp/providers/wasender.ts`
- Create: `__tests__/whatsapp/providers/wasender.test.ts`
- Create: `config/wasender-templates.example.json` (template for future clients; not loaded at runtime)

- [ ] **Step 1: Create `config/wasender-templates.example.json`**

```json
{
  "first_contact_he": {
    "language": "he",
    "category": "LOCAL",
    "body": "שלום {{1}}, פנית אלינו דרך {{2}}. נשמח לחזור אליך — מתי נוח?",
    "buttons": []
  },
  "interview_invite_he": {
    "language": "he",
    "category": "LOCAL",
    "body": "{{1}}, נשמח לזמן אותך לראיון ב-{{2}}. מאשרים?",
    "buttons": []
  }
}
```

> **For Hebrew content edits:** the `hebrew-content-writer` skill must be invoked before changing user-facing Hebrew copy. The example above is illustrative; per-client copy is created when a Wasender client onboards.

- [ ] **Step 2: Write the failing tests**

Write `__tests__/whatsapp/providers/wasender.test.ts`:
```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- __tests__/whatsapp/providers/wasender.test.ts`
Expected: FAIL — `@/lib/whatsapp/providers/wasender` not found.

- [ ] **Step 4: Create `lib/whatsapp/providers/wasender.ts` (config + registry only — HTTP send is Task 5)**

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- __tests__/whatsapp/providers/wasender.test.ts`
Expected: 4 passing tests.

- [ ] **Step 6: Update `lib/whatsapp/index.ts` to use the real Wasender provider**

Replace the inline `wasenderProvider` stub with an import:
```ts
import { wasenderProvider } from "./providers/wasender";
```
Remove the stub declaration.

- [ ] **Step 7: Run all tests**

Run: `npm test`
Expected: all green. The factory test for `provider: "wasender"` now returns the real (but not-yet-send-wired) provider; that's still correct.

- [ ] **Step 8: Commit**

```bash
git add lib/whatsapp/providers/wasender.ts lib/whatsapp/index.ts __tests__/whatsapp/providers/wasender.test.ts config/wasender-templates.example.json
git commit -m "feat(wasender): config + local template registry

Provider reads WASENDER_* envs and a per-client JSON registry at
config/wasender-templates.<slug>.json. getTemplates() and partial
sendTemplateMessage validation are wired; HTTP send lands in Task 5.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 5: Wasender Provider — HTTP Send + Error Mapping

**Files:**
- Modify: `lib/whatsapp/providers/wasender.ts`
- Modify: `__tests__/whatsapp/providers/wasender.test.ts`

- [ ] **Step 1: Append failing HTTP tests to the Wasender test file**

Add to `__tests__/whatsapp/providers/wasender.test.ts`:
```ts
describe("wasenderProvider — HTTP send", () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    setEnvs();
    jest.resetModules();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
  });

  it("POSTs to /send-message with rendered body and returns messageId", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { message_id: "wa-123" }, status: "PENDING" }), { status: 200 }),
    );
    const { wasenderProvider } = await import("@/lib/whatsapp/providers/wasender");
    const result = await wasenderProvider.sendTemplateMessage({
      to: "0501234567",
      templateName: "first_contact_he",
      language: "he",
      placeholders: ["דנה", "פייסבוק"],
    });
    expect(result.messageId).toBe("wa-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/send-message");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.text).toContain("דנה");
    expect(body.text).toContain("פייסבוק");
    expect(body.text).not.toContain("{{1}}");
  });

  it("maps 401 → auth", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }));
    const { wasenderProvider } = await import("@/lib/whatsapp/providers/wasender");
    await expect(
      wasenderProvider.sendTemplateMessage({ to: "0501234567", templateName: "first_contact_he", language: "he", placeholders: ["a", "b"] })
    ).rejects.toMatchObject({ kind: "auth", status: 401 });
  });

  it("maps 429 → rate_limit", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ retry_after: 5 }), { status: 429 }));
    const { wasenderProvider } = await import("@/lib/whatsapp/providers/wasender");
    await expect(
      wasenderProvider.sendTemplateMessage({ to: "0501234567", templateName: "first_contact_he", language: "he", placeholders: ["a", "b"] })
    ).rejects.toMatchObject({ kind: "rate_limit", status: 429 });
  });

  it("maps 'Session is not Connected' → session_down", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Session is not Connected" }), { status: 422 }),
    );
    const { wasenderProvider } = await import("@/lib/whatsapp/providers/wasender");
    await expect(
      wasenderProvider.sendTemplateMessage({ to: "0501234567", templateName: "first_contact_he", language: "he", placeholders: ["a", "b"] })
    ).rejects.toMatchObject({ kind: "session_down" });
  });

  it("maps 5xx → upstream", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }));
    const { wasenderProvider } = await import("@/lib/whatsapp/providers/wasender");
    await expect(
      wasenderProvider.sendTemplateMessage({ to: "0501234567", templateName: "first_contact_he", language: "he", placeholders: ["a", "b"] })
    ).rejects.toMatchObject({ kind: "upstream", status: 502 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- __tests__/whatsapp/providers/wasender.test.ts`
Expected: 5 new failures (existing 4 still pass).

- [ ] **Step 3: Replace the stub `sendTemplateMessage` in `lib/whatsapp/providers/wasender.ts`**

Add an import at the top:
```ts
import { normalizePhone } from "@/lib/phone";
```

Replace the existing `sendTemplateMessage` function body with:
```ts
async function sendTemplateMessage(params: SendTemplateParams): Promise<SendTemplateResult> {
  const { apiKey, baseUrl, sessionId } = getConfig();
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

  const res = await fetch(`${baseUrl}/send-message`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Session-Id": sessionId,
    },
    body: JSON.stringify({ to, text }),
  });

  const body = await res.text();
  if (!res.ok) {
    let kind: "auth" | "rate_limit" | "session_down" | "bad_request" | "upstream" = "upstream";
    if (res.status === 401 || res.status === 403) kind = "auth";
    else if (res.status === 429) kind = "rate_limit";
    else if (/session is not connected/i.test(body)) kind = "session_down";
    else if (res.status >= 400 && res.status < 500) kind = "bad_request";
    throw new WhatsAppSendError("wasender", kind, `Wasender error ${res.status}`, res.status, body);
  }

  let parsed: { data?: { message_id?: string }; status?: string };
  try {
    parsed = body ? JSON.parse(body) : {};
  } catch {
    throw new WhatsAppSendError("wasender", "upstream", "Non-JSON response from Wasender", res.status, body);
  }
  const messageId = parsed.data?.message_id;
  if (!messageId) {
    throw new WhatsAppSendError("wasender", "upstream", "Wasender returned no message_id", res.status, body);
  }
  return { messageId, status: parsed.status ?? "PENDING" };
}
```

> **Note for implementer:** the exact Wasender header/body shape (`X-Session-Id` vs session-scoped API key, `to`/`text` vs other field names) should be cross-checked against `docs/superpowers/research/wasender-primer.md` §1 and the live `wasenderapi.com/api-docs/getting-started`. If the live docs differ, follow the docs and update both the code and the tests. Don't invent.

- [ ] **Step 4: Run all Wasender tests**

Run: `npm test -- __tests__/whatsapp/providers/wasender.test.ts`
Expected: 9 passing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/whatsapp/providers/wasender.ts __tests__/whatsapp/providers/wasender.test.ts
git commit -m "feat(wasender): HTTP send + typed error mapping

POST /api/send-message with rendered body. Maps HTTP status / response
body to WhatsAppSendError kinds: auth (401/403), rate_limit (429),
session_down ('Session is not Connected'), bad_request (other 4xx),
upstream (5xx / network / unknown).

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 6: Pacing Module

**Files:**
- Create: `lib/whatsapp/pacing.ts`
- Create: `__tests__/whatsapp/pacing.test.ts`

- [ ] **Step 1: Write the failing tests**

Write `__tests__/whatsapp/pacing.test.ts`:
```ts
import {
  computeJitterMs,
  acquireSendLock,
  releaseSendLock,
  isDailyCapReached,
} from "@/lib/whatsapp/pacing";

describe("computeJitterMs", () => {
  it("returns a value in [15000, 45000]", () => {
    for (let i = 0; i < 50; i++) {
      const ms = computeJitterMs();
      expect(ms).toBeGreaterThanOrEqual(15_000);
      expect(ms).toBeLessThanOrEqual(45_000);
    }
  });
});

describe("send lock", () => {
  it("serialises calls per sessionId", async () => {
    const events: string[] = [];
    async function run(label: string) {
      const release = await acquireSendLock("s1");
      events.push(`acquire-${label}`);
      await new Promise((r) => setTimeout(r, 5));
      events.push(`release-${label}`);
      release();
    }
    await Promise.all([run("a"), run("b")]);
    // Either a fully completes before b starts, or vice versa — no interleave
    const isInterleavedA = events.indexOf("acquire-a") < events.indexOf("acquire-b")
      && events.indexOf("release-a") < events.indexOf("acquire-b");
    const isInterleavedB = events.indexOf("acquire-b") < events.indexOf("acquire-a")
      && events.indexOf("release-b") < events.indexOf("acquire-a");
    expect(isInterleavedA || isInterleavedB).toBe(true);
  });

  it("locks are independent per sessionId", async () => {
    const r1 = await acquireSendLock("s1");
    const r2 = await acquireSendLock("s2"); // must resolve immediately
    expect(typeof r2).toBe("function");
    r1();
    r2();
  });
});

describe("isDailyCapReached", () => {
  it("returns false when counter < cap", async () => {
    const result = await isDailyCapReached({
      sessionId: "s1",
      cap: 60,
      countTodayForSession: async () => 10,
    });
    expect(result).toBe(false);
  });

  it("returns true when counter >= cap", async () => {
    const result = await isDailyCapReached({
      sessionId: "s1",
      cap: 60,
      countTodayForSession: async () => 60,
    });
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- __tests__/whatsapp/pacing.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/whatsapp/pacing.ts`**

```ts
const sessionLocks = new Map<string, Promise<void>>();

export function computeJitterMs(): number {
  const min = 15_000;
  const max = 45_000;
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function acquireSendLock(sessionId: string): Promise<() => void> {
  const previous = sessionLocks.get(sessionId);
  let release!: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });
  const chained = previous ? previous.then(() => next) : next;
  sessionLocks.set(sessionId, chained);
  if (previous) await previous;
  return () => {
    release();
    if (sessionLocks.get(sessionId) === chained) {
      sessionLocks.delete(sessionId);
    }
  };
}

export function releaseSendLock(release: () => void): void {
  release();
}

export interface DailyCapInput {
  sessionId: string;
  cap: number;
  countTodayForSession: () => Promise<number>;
}

export async function isDailyCapReached(input: DailyCapInput): Promise<boolean> {
  const count = await input.countTodayForSession();
  return count >= input.cap;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- __tests__/whatsapp/pacing.test.ts`
Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/whatsapp/pacing.ts __tests__/whatsapp/pacing.test.ts
git commit -m "feat(whatsapp): pacing module — jitter, lock, daily cap

15–45 s jitter, per-session in-process lock (serialises sends to a
single WhatsApp Web session), daily-cap predicate fed by a caller-
supplied count function (Sheets-backed at the call site).

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 7: Wire Pacing into Wasender + Cron batchSize

**Files:**
- Modify: `lib/whatsapp/providers/wasender.ts`
- Modify: `app/api/cron/triggers/route.ts`
- Modify: `__tests__/whatsapp/providers/wasender.test.ts`
- Create: `lib/whatsapp/dailyCount.ts` (Sheets-backed daily counter)

- [ ] **Step 1: Create `lib/whatsapp/dailyCount.ts`**

```ts
import { getSheetRows } from "@/lib/sheets";

/**
 * Counts today's outbound sends for a given Wasender session by scanning
 * the leads sheet. Treats any row whose `sent_at` falls within the current
 * UTC day as a hit. Best-effort: if `sent_at` is unparseable, the row is
 * skipped (no silent zero).
 */
export async function countSentTodayForSession(sessionId: string): Promise<number> {
  const rows = await getSheetRows();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  let count = 0;
  for (const row of rows) {
    if (row.wa_session_id !== sessionId) continue;
    if (!row.sent_at) continue;
    if (typeof row.sent_at !== "string") continue;
    if (row.sent_at.slice(0, 10) === today) count++;
  }
  return count;
}
```

> **Note for implementer:** The helper above assumes `getSheetRows()` exists and returns rows with `wa_session_id` + `sent_at` columns. If `lib/sheets.ts` exposes a different reader name, use that. If `wa_session_id` is not yet a column in the Sheet, add a fallback: count all of today's rows for the current client when `row.wa_session_id` is undefined. Don't silently return 0 — log a warning and use the fallback.

- [ ] **Step 2: Append failing pacing-integration tests**

Add to `__tests__/whatsapp/providers/wasender.test.ts`:
```ts
describe("wasenderProvider — pacing integration", () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    setEnvs();
    jest.resetModules();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
  });

  it("throws rate_limit when daily cap is reached", async () => {
    jest.doMock("@/lib/whatsapp/dailyCount", () => ({
      countSentTodayForSession: async () => 60,
    }));
    jest.doMock("@/client.config", () => ({
      clientConfig: {
        slug: "test-client",
        integrations: { whatsapp: { provider: "wasender", dailyCap: 60, batchSize: 8 } },
      },
    }));
    const { wasenderProvider } = await import("@/lib/whatsapp/providers/wasender");
    await expect(
      wasenderProvider.sendTemplateMessage({ to: "0501234567", templateName: "first_contact_he", language: "he", placeholders: ["a", "b"] })
    ).rejects.toMatchObject({ kind: "rate_limit" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- __tests__/whatsapp/providers/wasender.test.ts -t "pacing integration"`
Expected: FAIL — daily cap not yet wired into the provider.

- [ ] **Step 4: Modify `lib/whatsapp/providers/wasender.ts` to enforce the daily cap and lock**

At the top, add:
```ts
import { acquireSendLock, isDailyCapReached, computeJitterMs, sleep } from "@/lib/whatsapp/pacing";
import { countSentTodayForSession } from "@/lib/whatsapp/dailyCount";
```

Inside `sendTemplateMessage`, **before** the `fetch` call, add (after `renderBody(...)`):
```ts
const dailyCap = clientConfig.integrations.whatsapp.dailyCap ?? 60;
if (await isDailyCapReached({ sessionId, cap: dailyCap, countTodayForSession: () => countSentTodayForSession(sessionId) })) {
  throw new WhatsAppSendError(
    "wasender",
    "rate_limit",
    `Daily cap of ${dailyCap} sends reached for session ${sessionId}`,
    429,
  );
}
const release = await acquireSendLock(sessionId);
try {
  await sleep(computeJitterMs());
  // ...existing fetch call and response handling stays here...
} finally {
  release();
}
```

Move the existing `fetch` block + response handling inside the `try { ... }` so the lock is always released. The `return` statement is the last line of the `try`.

- [ ] **Step 5: Run the Wasender tests to verify pacing-integration passes**

Run: `npm test -- __tests__/whatsapp/providers/wasender.test.ts`
Expected: all (10+) passing. **Note:** the existing HTTP tests now incur a 15–45 s sleep. Mock `computeJitterMs` in those tests to return 0, OR globally override with `jest.spyOn`. Add to the `beforeEach` of the "HTTP send" describe block:
```ts
jest.doMock("@/lib/whatsapp/pacing", () => ({
  ...jest.requireActual("@/lib/whatsapp/pacing"),
  computeJitterMs: () => 0,
  sleep: async () => {},
  acquireSendLock: async () => () => {},
  isDailyCapReached: async () => false,
}));
```

Re-run: `npm test -- __tests__/whatsapp/providers/wasender.test.ts`
Expected: all passing, test run under 5 seconds.

- [ ] **Step 6: Modify `app/api/cron/triggers/route.ts` to slice by `batchSize`**

Find the existing loop over pending leads (around line 51). Before the loop, add:
```ts
import { clientConfig } from "@/client.config";

const batchSize = clientConfig.integrations.whatsapp.provider === "wasender"
  ? (clientConfig.integrations.whatsapp.batchSize ?? 8)
  : Infinity; // Infobip: no batching needed (no ban risk)
const pending = await findPendingTriggers();
const slice = pending.slice(0, batchSize);
```

Then change the loop variable from `pending` to `slice`. Leave the per-lead `try/catch` shape unchanged (per spec §6: one bad lead does not poison the batch).

- [ ] **Step 7: Run the build + tests**

Run: `npx tsc --noEmit && npm test`
Expected: typecheck clean, all tests green.

- [ ] **Step 8: Commit**

```bash
git add lib/whatsapp/providers/wasender.ts lib/whatsapp/dailyCount.ts app/api/cron/triggers/route.ts __tests__/whatsapp/providers/wasender.test.ts
git commit -m "feat(whatsapp): wire pacing — daily cap, lock, jitter, cron batchSize

Wasender provider now blocks at daily cap, serialises per-session sends
via the pacing lock, and waits jitter (15–45 s) before each send. Cron
loop processes max batchSize pending leads per tick (default 8) when
the configured provider is Wasender. Infobip path is unbatched.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 8: Document the New Env Vars

**Files:**
- Modify or Create: `.env.local.example`

- [ ] **Step 1: Check whether `.env.local.example` exists**

Run: `ls -la .env.local.example 2>/dev/null || echo "missing"`
If missing, create a new file. If present, append to it.

- [ ] **Step 2: Add the Wasender block**

Append (or create with):
```bash
# --- Wasender (only when integrations.whatsapp.provider === "wasender") ---
WASENDER_API_KEY=
WASENDER_BASE_URL=https://www.wasenderapi.com/api
WASENDER_SESSION_ID=
```

- [ ] **Step 3: Commit**

```bash
git add .env.local.example
git commit -m "docs(env): document WASENDER_* env vars

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 9: Manual Smoke Checklist + Final Build

**Files:**
- Create: `docs/superpowers/specs/2026-05-11-wasender-smoke-checklist.md`

- [ ] **Step 1: Run final build + tests in the worktree**

Run:
```bash
npx tsc --noEmit
npm run build
npm test
```

Expected: typecheck clean, Next.js build succeeds, all Jest tests pass.

- [ ] **Step 2: Write the manual smoke checklist**

Write `docs/superpowers/specs/2026-05-11-wasender-smoke-checklist.md`:
```markdown
# Wasender Integration — Manual Smoke Checklist

This is the G6 gate from the orchestration playbook. Run all steps on a
Vercel preview deploy of this branch before merging.

## Part A — Infobip regression (Mechinat Gvana flow)

- [ ] Preview deploy URL boots (200 on `/login`)
- [ ] Create a test lead via `/api/webhooks/...` against the preview URL
- [ ] Confirm the lead lands in the Sheet within ~10 s
- [ ] Trigger a manual send via the dashboard (template = existing one)
- [ ] Confirm WhatsApp arrives on the test phone
- [ ] Confirm Sheet row gets `last_sent_template`, `last_message_id`, `last_sent_at`
- [ ] Confirm CAPI "Lead" event arrives in Facebook Events Manager Test Events tab
- [ ] Check Vercel runtime logs — no errors

## Part B — Wasender flow (fork a preview to wasender)

Pre-req: Wasender account, session linked via QR, `WASENDER_*` envs set in
this preview, `config/wasender-templates.<your-slug>.json` committed.

- [ ] Temporarily set `clientConfig.integrations.whatsapp.provider` to
      `"wasender"` in the preview deploy (push a one-line config change to a
      throwaway branch, NOT main)
- [ ] Repeat the create-lead → manual send flow
- [ ] Confirm a real WhatsApp arrives, body matches the rendered template
- [ ] Confirm Sheet stores Wasender `message_id`
- [ ] Confirm CAPI event arrives in Facebook Events Manager
- [ ] Confirm `npm test` still green on the throwaway branch

## Part C — Failure-path smoke

- [ ] Unlink the WhatsApp session from the phone — fire a send via cron
- [ ] Confirm the route returns 500
- [ ] Confirm the Vercel log line contains `[wasender/session_down]`
- [ ] Confirm the Sheet row is **not** marked `sent` (stays pending)
- [ ] Re-link the session, re-tick the cron, confirm send succeeds
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-11-wasender-smoke-checklist.md
git commit -m "docs(wasender): manual smoke checklist for G6 gate

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

- [ ] **Step 4: Surface the checklist to the user**

Tell the user:
> Implementation tasks complete. Smoke checklist at
> `docs/superpowers/specs/2026-05-11-wasender-smoke-checklist.md`. Push the
> branch and let me know when you've completed Parts A, B, C on the
> preview — that's the G6 gate before we invoke
> `superpowers:finishing-a-development-branch`.

---

## Self-Review Notes (filled in after writing)

**Spec coverage:**
- §1 file layout → Tasks 1, 4–7 build the files; Task 3 deletes the old.
- §2 interface → Tasks 1, 2.
- §3 config schema → Task 2 (includes `batchSize` + `dailyCap`).
- §4 template registry → Task 4 + the example JSON.
- §5 pacing → Tasks 6 + 7.
- §6 error handling → Task 5 (Wasender mapping) + Task 3 (Infobip mapping).
- §7 CAPI → no task (unchanged); call-site updates in Task 3 keep CAPI fire-after-send.
- §8 testing → every code task has unit tests; Task 9 covers manual smoke.
- §9 migration → Task 2 (default `infobip`), Task 3 (delete old file). Mechinat Gvana smoke is Part A of Task 9.
- §11 decided items → batchSize 8 (Task 2 + 7), dailyCap 60 (Task 2 + 7), JSON registry (Task 4).

**Placeholder scan:** none found.

**Type consistency:** all signatures (`SendTemplateParams`, `SendTemplateResult`, `WhatsAppSendError` constructor) are defined once in Task 1 and re-used unchanged through Tasks 2–7.

**Known gap:** Task 7's `dailyCount.ts` depends on a `wa_session_id` column in the Sheet that may not exist today. The implementer note flags the fallback; the schema change to the Sheet is a Wasender-onboarding operational step, not a code task.

---

## Execution

After this plan is approved, two execution options:

1. **Subagent-Driven (recommended)** — Fresh `general-purpose` subagent per task, two-stage review (spec compliance + code quality) between tasks. Slower wall-clock, much higher correctness, matches the orchestration playbook's Phase 4.
2. **Inline Execution** — Tasks executed in this session using `superpowers:executing-plans`, batched with human checkpoints. Faster, but the implementer (this session) shares context that the spec-reviewer should ideally not see.

Default recommendation: **Subagent-Driven** for Tasks 1, 4, 5, 6, 7 (pure new code), **Inline** for Tasks 0, 2, 3, 8, 9 (scaffolding, refactor, docs).
