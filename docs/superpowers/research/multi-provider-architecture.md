# Multi-Provider WhatsApp Architecture

**Status:** Research / design proposal
**Source path used for reads:** worktree
(`/Users/a/Claude-Projects/מכינת גוונא/worktrees/nihul-leadim/feat-wasender_05-2026`).
The feature branch has not modified `lib/*` or `client.config.ts` yet,
so line references below are equivalent to the main folder.

---

## Executive Summary

We want to add **Wasender** as a second outbound WhatsApp provider
alongside the existing **Infobip** integration. Selection is per-client,
driven by `client.config.ts`. The existing `features.multiSender: false`
flag already anticipated this.

The cleanest minimal change:

1. Introduce a tiny `WhatsAppProvider` interface that matches the two
   functions callers actually need today: `sendTemplateMessage` and
   `getTemplates`.
2. Move the current `lib/infobip.ts` body behind that interface as
   `lib/whatsapp/providers/infobip.ts`.
3. Add `lib/whatsapp/providers/wasender.ts` implementing the same shape.
4. Expose a single factory `getWhatsAppProvider()` in
   `lib/whatsapp/index.ts` that reads `clientConfig.integrations.whatsapp.provider`
   and returns the right implementation.
5. Update the three call sites (`app/api/messages/send/route.ts`,
   `app/api/cron/triggers/route.ts`, `app/api/templates/sync/route.ts`)
   to import from `@/lib/whatsapp` instead of `@/lib/infobip`.

CAPI, Sheets writes, phone normalization, and error logging all stay
where they are. No queue, no state machine, no fallback chains.
Sync throughout. Default provider is `"infobip"`, so Mechinat Gvana is
unaffected by deploy.

---

## What Exists Today

### `lib/infobip.ts` — the only outbound surface

Three things are exported and used elsewhere
(`lib/infobip.ts:36-106`):

- `WhatsAppTemplate` interface (`:36-47`) — shape returned by the
  Infobip "list approved templates" endpoint.
- `getTemplates(): Promise<WhatsAppTemplate[]>` (`:49-57`) — filters
  to `status === "APPROVED"`.
- `SendMessageParams`, `SendMessageResult` (`:59-70`) and
  `sendTemplateMessage(params)` (`:72-106`) — calls
  `POST /whatsapp/1/message/template` with body, language,
  placeholders. Normalizes the destination phone via `normalizePhone`
  (`:76`). Returns `{ messageId, status }`.

Env wiring lives in `getConfig()` (`:9-17`) — reads
`INFOBIP_API_KEY`, `INFOBIP_BASE_URL`, `INFOBIP_SENDER` and throws
loudly if any are missing.

Error handling in `infobipFetch()` (`:19-34`) reads the response body
on `!res.ok` and throws `Error("Infobip API error <status>: <body>")`.
No silent failures — every non-2xx becomes an exception that bubbles
to the route handler.

### Callers

- **`app/api/messages/send/route.ts:46-52`** — manual send from the
  dashboard. Calls `sendTemplateMessage(...)`, then `updateLeadCells`
  with `messageId`, then fires CAPI `"Lead"` (`:62-66`). CAPI is
  fire-and-forget with `.catch(err => console.error(...))`.
- **`app/api/cron/triggers/route.ts:51-57`** — scheduled trigger
  dispatcher. Same shape: send → write to Sheet → fire CAPI
  (`:66-72`, awaited here, with `trigger.capi_event` name). Per-lead
  errors are caught and pushed into a results array (`:80-86`).
- **`app/api/templates/sync/route.ts:7-17`** — admin endpoint that
  surfaces approved templates to the UI. Calls `getTemplates()`.
- **`components/TemplateManager.tsx`** — imports the
  `WhatsAppTemplate` type only.

`lib/triggers.ts` itself does **not** call Infobip — it only finds
pending triggers (`findPendingTriggers`, `:33-58`). The cron route
does the dispatch.

### CAPI today

`lib/capi.ts:38-90` (`sendCAPIEvent`) is already provider-agnostic.
It hashes the phone with `sha256` (`:24-26`) and fires `event_name`
("Lead", or whatever `trigger.capi_event` says). Nothing in `capi.ts`
references Infobip. Good — we keep it where it is.

---

## Proposed `WhatsAppProvider` Interface

Minimal — only what both providers must support today.

```ts
// lib/whatsapp/types.ts
import type { WhatsAppTemplate } from "./types";

export interface SendTemplateParams {
  to: string;                  // phone, will be normalized inside
  templateName: string;
  language: string;            // e.g. "he"
  placeholders: string[];      // ordered, matches template variables
  sender?: string;             // override per-trigger; optional
}

export interface SendTemplateResult {
  messageId: string;           // provider's message ID (round-trip into Sheet)
  status: string;              // e.g. "PENDING" | "ACCEPTED" — provider-specific text OK
}

export interface WhatsAppTemplate {
  name: string;
  language: string;
  status: string;              // we filter "APPROVED" inside provider
  category: string;
  structure: {
    header?: { format: string };
    body: { text: string; examples?: string[] };
    footer?: { text: string };
    buttons?: Array<{ type: string; text: string }>;
  };
}

export interface WhatsAppProvider {
  readonly name: "infobip" | "wasender";
  sendTemplateMessage(params: SendTemplateParams): Promise<SendTemplateResult>;
  getTemplates(): Promise<WhatsAppTemplate[]>;
}

// Unified error type — thrown by every provider implementation.
export class WhatsAppSendError extends Error {
  constructor(
    public readonly provider: "infobip" | "wasender",
    public readonly kind: "config" | "auth" | "rate_limit" | "bad_request" | "upstream",
    message: string,
    public readonly status?: number,
    public readonly upstreamBody?: string,
  ) {
    super(`[${provider}/${kind}] ${message}`);
    this.name = "WhatsAppSendError";
  }
}
```

That's the whole contract. No `sendFreeText` in v1 — both call sites
today use templates only, which matches WhatsApp's 24-hour-window
policy noted in `CLAUDE.md`. Add it when a real use case appears.

---

## Proposed Config Schema

Add a `whatsapp` block to `integrations` and keep `infobip.enabled`
for the v1 transition. The `features.multiSender` flag stays; it gates
whether the dashboard surfaces a per-trigger sender override.

```ts
// client.config.ts (additions only)
export interface ClientConfig {
  // ...existing fields...
  integrations: {
    whatsapp: {
      provider: "infobip" | "wasender";
      // future: rateLimit, defaultLanguage, etc.
    };
    infobip: { enabled: boolean };     // kept for v1, prunable in v2
    capi: { enabled: boolean };
    sheets: { enabled: boolean };
  };
}

// Mechinat Gvana default — unchanged behavior
integrations: {
  whatsapp: { provider: "infobip" },
  infobip: { enabled: true },
  capi: { enabled: true },
  sheets: { enabled: true },
},
```

Provider-specific secrets stay in `.env.local`:

- `INFOBIP_API_KEY`, `INFOBIP_BASE_URL`, `INFOBIP_SENDER` (existing).
- `WASENDER_API_KEY`, `WASENDER_BASE_URL`, `WASENDER_SENDER` (new).

Providers read their own envs in `getConfig()` and throw at first use
if missing. Same shape as today. **No `if (slug === "...")`** anywhere.

---

## Folder Layout

```
lib/
  whatsapp/
    index.ts                  ← exports getWhatsAppProvider() + re-exports types
    types.ts                  ← WhatsAppProvider, SendTemplateParams, errors
    providers/
      infobip.ts              ← moved content of current lib/infobip.ts
      wasender.ts             ← new
  infobip.ts                  ← DELETED in same PR (or re-export shim for one release)
  capi.ts                     ← unchanged
  phone.ts                    ← unchanged
  triggers.ts                 ← unchanged
```

`lib/whatsapp/index.ts` is the single factory:

```ts
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
      throw new Error(`Unknown WhatsApp provider: ${_exhaustive}`);
    }
  }
}
```

Each provider exports a singleton object that implements
`WhatsAppProvider`. No classes, no DI container — vanilla as required
by `CLAUDE.md`.

Callers change from:

```ts
import { sendTemplateMessage } from "@/lib/infobip";
```

to:

```ts
import { getWhatsAppProvider } from "@/lib/whatsapp";
const wa = getWhatsAppProvider();
await wa.sendTemplateMessage({ ... });
```

Three files touched: `app/api/messages/send/route.ts`,
`app/api/cron/triggers/route.ts`, `app/api/templates/sync/route.ts`.
`components/TemplateManager.tsx` switches its type import to
`@/lib/whatsapp`.

---

## Error Handling Strategy

Every provider throws `WhatsAppSendError` with a `kind`. Callers stay
as they are: route handlers wrap in `try/catch`, log the full error
(`console.error`), and return the HTTP 500 with a safe message. The
cron route's per-lead `try/catch` (`route.ts:80-86`) keeps the same
shape — one bad lead doesn't poison the batch.

| Failure                          | `kind`        | Provider behavior                                | Caller behavior                              |
| -------------------------------- | ------------- | ------------------------------------------------ | -------------------------------------------- |
| Missing env vars                 | `config`      | Throw on first `getConfig()` call                | 500 + `console.error`; deploy is misconfigured |
| 401 / 403 from API               | `auth`        | Throw with `status` + body                       | 500 + log; secret rotated / revoked          |
| 429 rate limit                   | `rate_limit` | Throw with `status` + body                       | 500 + log; **no retry in v1** (sync, simple) |
| 400 bad payload (template, phone)| `bad_request` | Throw with body                                  | 500 + log; mapping or phone is wrong         |
| 5xx / network / unknown          | `upstream`    | Throw with status + body                         | 500 + log; transient, operator retries       |

**Retry scope:** none in v1. The cron loops over pending leads; if
Infobip 429s, the lead stays `status: "new"` (we only write the Sheet
on success), so the next cron tick picks it up. That is the retry
mechanism. **No exponential backoff library**, no queue.

**Idempotency:** Sheet write only happens after a successful send
returns a `messageId`. If we crash between send-success and Sheet-write
(rare, sync code), the lead looks unsent and gets picked up next tick —
duplicate WhatsApp send is *possible*. Same risk exists today; accept
it per "pick simple over clever". Revisit only if we see it.

**No empty catch blocks.** Anywhere we catch, we either re-throw or
`console.error(err)` with full context. Per `CLAUDE.md`: fail loud.

---

## CAPI Implications

CAPI today fires *after* a successful `sendTemplateMessage` return —
see `app/api/messages/send/route.ts:62-66` and
`app/api/cron/triggers/route.ts:66-72`. It uses `lib/capi.ts`, which
only takes phone + leadId + event name. No Infobip references.

**Confirmed provider-agnostic.** With the factory pattern, CAPI still
fires on the logical event "message accepted by upstream" — i.e.
right after `await wa.sendTemplateMessage(...)` returns without
throwing. Wasender will return its own `messageId`; CAPI doesn't care
what shape it is. No change needed in `lib/capi.ts`.

One subtle thing: CAPI today hashes `lead.phone` raw
(`capi.ts:24-26`), while the outbound call normalizes via
`normalizePhone` inside the provider. These must agree, or attribution
breaks silently. Today's code has this exact split already — Wasender
doesn't change it. If we ever align CAPI to the normalized form, it's
a one-line change in `capi.ts`, not per provider.

---

## Testing Strategy

### Unit tests

The interface is tiny, so faking is one file:

```ts
// __tests__/helpers/fakeProvider.ts
export function makeFakeProvider(overrides?: Partial<WhatsAppProvider>): WhatsAppProvider {
  return {
    name: "infobip",
    sendTemplateMessage: jest.fn().mockResolvedValue({ messageId: "fake-1", status: "PENDING" }),
    getTemplates: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}
```

Inject via module mock of `@/lib/whatsapp`. Tests cover:

1. Route calls provider with normalized payload.
2. Sheet write happens **after** provider returns.
3. CAPI is fired **after** Sheet write succeeds.
4. Provider throwing `WhatsAppSendError` → route returns 500, Sheet
   is **not** mutated, CAPI is **not** fired.
5. `getWhatsAppProvider()` returns Infobip when config says infobip,
   Wasender when config says wasender, throws on unknown.

Per `CLAUDE.md`: tests for changed code only. No backfill of the
existing suite.

### Manual verification in deploy preview

1. Push branch → Vercel preview URL.
2. Set the preview deploy's `clientConfig.integrations.whatsapp.provider`
   to `"infobip"`, confirm Mechinat Gvana flow still works end-to-end:
   create a test lead → cron fires → Sheet updates → WhatsApp arrives.
3. Flip to `"wasender"` in `client.config.ts` (or fork the config in
   the preview), set Wasender envs, repeat. Confirm a real WhatsApp
   is sent, the Sheet row gets the Wasender `messageId`, and CAPI's
   "Lead" event arrives in Facebook Events Manager test view.
4. Check console / Vercel logs for any silent failure. There should
   be none — every send logs on error.

---

## Migration Path

The whole point of `features.multiSender: false` is to make this a
zero-impact change.

1. **Default provider is `"infobip"`** in `client.config.ts`. Mechinat
   Gvana's deployment ships unchanged behavior.
2. The factory throws on unknown provider strings, so a typo in
   config fails fast at boot of the first route call — loud.
3. The old `lib/infobip.ts` either becomes a re-export shim for one
   release or is deleted same-PR. Recommend **delete same-PR** —
   only three imports to update, and a shim adds permanent noise.
4. New client onboards: set
   `integrations.whatsapp.provider: "wasender"` in their
   `client.config.ts` + add `WASENDER_*` envs in their Vercel project.
   That's it.

Live Mechinat Gvana sees **zero behavioral change**: same Infobip
endpoint, same payload shape, same `messageId` round-tripping into
the Sheet, same CAPI events.

---

## Open Questions

1. **Wasender template-list shape.** Does Wasender expose a "list
   approved templates" endpoint with a comparable shape, or do we
   maintain templates in their portal only? If the latter,
   `getTemplates()` for Wasender returns an empty array (or reads
   from a local JSON), and the dashboard's template picker needs a
   "manual template name" fallback. *Needs answer from Agent A's
   Wasender research before we finalize the interface.*
2. **Wasender sender model.** Infobip's `sender` is a phone-number ID
   string (`config.sender`). If Wasender uses session IDs / device
   IDs instead, the `sender?: string` field in `SendTemplateParams`
   still works — but `trigger.sender === "default"` semantics in
   `app/api/cron/triggers/route.ts:56` should probably move to a
   normalized "use config default" sentinel inside each provider.
3. **Webhook inbound.** Out of scope for v1 (this is outbound only),
   but worth flagging: if Wasender pushes inbound replies to a
   webhook, we'll want a matching `lib/whatsapp/providers/wasender/webhook.ts`
   handler in a follow-up PR.
4. **Template variable mapping.** `config/template-mappings.json` is
   currently shared by all sends. If template names differ across
   Infobip and Wasender for the same client (unlikely — most teams
   re-register the same templates), we may need a per-provider
   mapping. Defer until we hit it.
5. **`features.multiSender` flag — what does it now mean?** Nothing
   reads it today. Proposed: it gates the per-trigger sender override
   UI (multiple senders per account). Provider selection stays
   separate via `integrations.whatsapp.provider` — orthogonal axes.

---

## Out of Scope (v1)

No queue, no state machine library, no fallback chain, no
circuit-breaker, no abstraction beyond the two-method interface, no
dashboard UI for provider switching (implementer edits
`client.config.ts`).
