# Leads Control Center — Design Spec

## Overview

A WhatsApp-based lead management dashboard for managing Facebook/Instagram Lead Ads. Built to be reusable across multiple clients with different branding, languages, workflows, and feature needs.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Multi-client strategy | Separate deployment per client, shared codebase | No auth complexity, clean data isolation, works at 2-15 clients |
| Config approach | `client.config.ts` + `.env.local` | Type-safe, version-controlled, easy to duplicate |
| i18n | Dictionary-based (he/en) with `t()` helper | Lightweight, no heavy library needed for 2 languages |
| Auth | Single password per deployment, cookie-based | Simple for internal tool, no user database needed |
| Data store | Google Sheets (one per client) | Client's existing workflow, Sheet is source of truth |
| WhatsApp | Infobip API with Meta-approved templates only | Official channel, template-only for conversation initiation |
| Ad optimization | Facebook CAPI events on send + qualify | Feeds conversion data back for ad optimization |

## Architecture

### Deployment Model

- One Git repo, one codebase
- Each client = separate Vercel project pointing to the same repo
- Client identity defined in `client.config.ts` (not env vars for non-secret config)
- Secrets (API keys, passwords) in `.env.local` / Vercel env vars

### Client Config (`client.config.ts`)

Controls all client-specific behavior:

```ts
export const clientConfig = {
  // Identity
  name: string,
  slug: string,
  logo: string,

  // Locale
  locale: "he" | "en",
  dir: "rtl" | "ltr",

  // Brand colors
  brand: {
    primary: string,
    secondary: string,
    accent: string,
    accentLight: string,
    background: string,
  },

  // Auth
  auth: { password: env.CLIENT_PASSWORD },

  // Lead workflow — fully customizable per client
  statuses: Array<{ key: string, label: string, color: string }>,

  // Feature flags
  features: {
    triggers: boolean,
    capi: boolean,
    multiSender: boolean,
    webhookFbLeads: boolean,
  },

  // Integration toggles
  integrations: {
    infobip: { enabled: boolean },
    capi: { enabled: boolean, pixelId: string },
    sheets: { sheetId: string },
  },
}
```

### i18n

- `lib/i18n/dictionaries/he.json` and `en.json` — flat key-value dictionaries
- `lib/i18n/index.ts` — `getDictionary(locale)` returns the dictionary, `t(key)` helper for lookups
- `clientConfig.locale` selects the dictionary
- `clientConfig.dir` sets HTML direction
- Tailwind RTL plugin handles layout mirroring
- Status labels come from `clientConfig.statuses`, not i18n dictionaries
- Date/time uses `Intl.DateTimeFormat` with locale

### Auth

- Next.js `middleware.ts` checks for signed HTTP-only session cookie
- No cookie → redirect to `/login`
- `/login` shows client logo + password field
- `POST /api/auth` verifies bcrypt-hashed password from env var
- Valid → set cookie (7-day expiry), redirect to dashboard
- Webhook routes (`/api/webhooks/*`) excluded from auth (validated by service signatures)
- Logout clears cookie

### Modules

**Module 1: Scaffolding & Google Sheets**
- Next.js 14 App Router + Tailwind CSS with RTL plugin
- Dynamic brand CSS variables from `clientConfig.brand` in root layout
- `lib/sheets.ts` — read/write leads via Google Sheets API v4
- Column mapping in `config/columns.json`
- Poll every 30s, Sheet is source of truth

**Module 2: Dashboard UI**
- Top nav with client logo + nav links (brand primary color)
- Stats bar: new leads today, messages sent, read receipts, qualified count
- Lead table: name, phone, source badge, status badge (config-driven), last message, actions
- All labels from i18n dictionary
- Responsive for mobile

**Module 3: Template Manager**
- `GET /api/templates/sync` — fetch approved templates from Infobip
- Variable mapping UI: map `{{1}}`, `{{2}}` to Sheet columns via dropdowns
- Mappings saved in `config/template-mappings.json`
- RTL WhatsApp bubble preview with sample data
- Only approved Meta templates can initiate conversations

**Module 4: Infobip + CAPI Integration**
- `POST /api/messages/send` — send template with variable substitution
- Multi-sender support (if `features.multiSender` enabled)
- `POST /api/webhooks/infobip` — delivery/read receipts → update Sheet status
- CAPI events (if `features.capi` enabled):
  - Message sent → `Lead` event
  - Qualify click → `Purchase`/custom event
  - Matching via hashed phone + email
- `POST /api/leads/qualify` — parallel: update Sheet + send follow-up + fire CAPI

**Module 5: Smart Triggers & Settings**
- Trigger rules in `config/triggers.json` (if `features.triggers` enabled)
- Vercel Cron every minute checks pending triggers
- Settings UI: senders, integration status, column mapping, CAPI config

## File Structure

```
├── client.config.ts
├── middleware.ts
├── app/
│   ├── layout.tsx
│   ├── login/page.tsx
│   ├── page.tsx
│   ├── templates/page.tsx
│   ├── settings/page.tsx
│   └── api/
│       ├── auth/route.ts
│       ├── leads/route.ts
│       ├── leads/qualify/route.ts
│       ├── messages/send/route.ts
│       ├── templates/sync/route.ts
│       ├── webhooks/facebook/route.ts
│       ├── webhooks/infobip/route.ts
│       └── cron/triggers/route.ts
├── lib/
│   ├── sheets.ts
│   ├── infobip.ts
│   ├── capi.ts
│   ├── triggers.ts
│   ├── auth.ts
│   ├── phone.ts
│   └── i18n/
│       ├── index.ts
│       └── dictionaries/
│           ├── he.json
│           └── en.json
├── components/
│   ├── LeadTable.tsx
│   ├── StatsBar.tsx
│   ├── TemplateManager.tsx
│   ├── MessagePreview.tsx
│   ├── TriggerEditor.tsx
│   ├── SettingsPanel.tsx
│   ├── StatusBadge.tsx
│   └── LoginForm.tsx
├── config/
│   ├── columns.json
│   ├── triggers.json
│   └── template-mappings.json
├── .env.local
├── tailwind.config.ts
├── next.config.js
└── package.json
```

## New Client Onboarding (~20-30 min)

1. Clone repo → connect to new Vercel project
2. Edit `client.config.ts` (name, brand, locale, statuses, features)
3. Set env vars (password, Sheet ID, Google SA key, Infobip key, CAPI tokens)
4. Configure external services (share Sheet, set webhook URLs)
5. Deploy via `git push`

## Phone Number Normalization

All phone numbers normalized to E.164 format before any API call:
- `050-1234567` → `+972501234567`
- `0501234567` → `+972501234567`
- US numbers similarly normalized
- Default country code from `clientConfig.locale`

## Tech Stack

- Next.js 14 (App Router)
- Tailwind CSS + `tailwindcss-rtl`
- Google Sheets API v4
- Infobip WhatsApp API
- Facebook Conversions API
- Vercel (deployment + cron)
