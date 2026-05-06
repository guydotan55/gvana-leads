# CLAUDE.md — Leads Control Center

## What This Is
WhatsApp-based lead management dashboard for NGOs running Facebook /
Instagram Lead Ads. Leads come in (from FB Lead Ads or organic forms),
land in a Google Sheet, and the team works them via this dashboard:
update status, send WhatsApp messages (via Infobip), fire CAPI events
back to Facebook for ad attribution.

Currently configured for **Mechinat Gvana** (`slug: "gavna"`).

## Status
**Pilot** — deployed for Mechinat Gvana, light usage so far.
**Next client onboarding within ~30 days.** Multi-client architecture
is an ACTIVE concern, not a future one.

---

## Multi-Client Architecture (CRITICAL)

One repo → many Vercel deployments, one per client. Each deployment has
its own `client.config.ts` (committed) + `.env.local` (secrets).
`client.config.ts` drives: branding, locale + RTL/LTR, lead status
workflows, feature flags, integration toggles.

### Rules (matter most — next client soon)
1. **Never hardcode anything client-specific.** Strings, colors,
   statuses, logos, integration choices — ALL flow through
   `client.config.ts`.
2. **Don't branch on slug.** `if (slug === "gavna")` = future bug.
   Add to the config schema instead.
3. **New features start as feature flags.** Add to `features` in
   `client.config.ts`, gate the code with it.
4. **Don't bake `dir="rtl"` directly.** Read `clientConfig.dir` —
   next client may be English LTR.

---

## Who Uses This

### Daily user — Office admin at the NGO
Profile: 30s–50s, **NOT tech-savvy.** Uses the **entire dashboard**
daily — lead table, form builder, trigger editor, settings, message
sending. **If anything in the dashboard needs explaining, it's broken.**
The whole UI must be self-serve.

### Implementer — Guy (you), no dashboard UI yet
Edits `client.config.ts`, `.env.local`, handles Vercel deployment when
onboarding a new client. **Currently has no dashboard UI section** —
may get one later (TBD, not built yet).

---

## UX Prime Directives (apply to every dashboard screen)

No exceptions — form builder, trigger editor, settings, lead table all
held to the same standard.

1. **Forgiveness by default** — soft delete + undo toast beats "Are you
   sure?" modals. Nothing irreversible without recovery.
2. **Progressive disclosure** — minimum fields visible by default; rare
   actions hidden under "advanced." Empty states teach the next step.
3. **Primary action per screen** — one obvious dominant CTA per screen,
   contextual to that screen. Lead table = "send next message"; form
   builder = "save form"; trigger editor = "save trigger." Secondary
   actions visually quieter.
4. **Warm + casual Hebrew** — invoke the `hebrew-content-writer` skill
   for any UI copy. Never use English tech words in user-facing text.
5. **Status changes show the next step** — marking a lead "relevant"
   should put the next action (first WhatsApp message) one click away,
   not in a separate workflow.

---

## How Claude Should Work On This Codebase

### Pick simple over clever
Vanilla Next.js + Tailwind. No state-machine libraries, no Redux, no
abstractions unless I ask. The form builder is custom on purpose.

### Fail loud, never silent
Every Google Sheets write, every Infobip send, every CAPI event must
log on failure. **No `catch {}`** without re-throwing or logging. A
silent failure here = a lead dropped without anyone noticing.

### Do exactly what was asked
Don't redesign the dashboard, add features, or refactor "while you're
in there." Suggest in chat; don't build.

### Testing policy
Tests for your own changes only — no suite to backfill.

### Verification after edits
- API/integration changes → deploy preview + send a test lead through
  the relevant endpoint (`/api/webhooks/...`, `/api/organic-lead`)
- UI changes → open in browser, check console, test Hebrew RTL
  rendering specifically
- Schema changes → coordinate with the client's Sheet first;
  **the Sheet is source of truth, not the code**

---

## Tech Stack

- **Framework:** Next.js 14 (App Router) + React 18 + TypeScript
- **Styling:** Tailwind 3 + `tailwindcss-rtl`
- **Auth:** Custom — bcryptjs (password) + jose (JWT in HTTP-only cookie).
  **One shared password per deployment.** No user database.
- **Data store:** Google Sheets (one per client) —
  **Sheet is source of truth**
- **Messaging:** Infobip (WhatsApp) — Meta-approved templates only for
  conversation initiation
- **Ad attribution:** Facebook CAPI — fires on send + qualification
- **Deployment:** Vercel (one project per client)

---

## Architecture (key files only)

- `client.config.ts` — per-deployment identity, flags, branding
- `middleware.ts` — auth gate. Public paths: `/login`, `/api/auth`,
  `/api/webhooks`, `/api/organic-lead`, `/api/track`,
  `/api/forms/[id]/submit`, `/form/*`
- `lib/auth.ts` — session creation + verification
- `lib/sheets.ts` — Google Sheets I/O (source of truth)
- `lib/infobip.ts` — WhatsApp send
- `lib/capi.ts` — Facebook conversion events
- `lib/phone.ts` — Israeli phone normalization (USE THIS for any phone work)
- `lib/triggers.ts` — automated actions on status change
- `app/(dashboard)/` — admin dashboard (auth required)
- `app/api/webhooks/` — FB/IG Lead Ads receivers

---

## Critical Flows

- **FB Lead Ad in:** webhook → write to Sheet → fire CAPI "Lead" → admin sees row
- **Organic form in:** `/form/[slug]` → POST → write to Sheet
- **Outreach:** admin picks Infobip template → fire CAPI → message sent
- **Status update:** triggers may auto-send follow-up + fire CAPI conversion

---

## Integration Gotchas

### Google Sheets is the source of truth
No database. No local mirror. The team works the Sheet directly when
needed. Code reads/writes via `lib/sheets.ts`.

### Infobip — templates only outside the 24-hour window
WhatsApp policy: a conversation can ONLY be initiated via a Meta-approved
template. Free-text replies allowed only within the 24-hour session
window after the lead replies. Don't try to bypass.

### CAPI — phone normalization must be consistent
Match keys hash the phone. **Use `lib/phone.ts`** — don't roll your own
normalization, or attribution silently breaks (no error, just no
conversion attributed to the ad — invisible until ad reports look wrong).

### Auth — one password per deployment
No user database. Password comes from env / `client.config.ts`. Don't
add per-user auth without a discussion — that's a major architecture
change.

---

## Secrets & Config (`.env.local`, never commit)

- `CLIENT_PASSWORD` — single shared password
- `JWT_SECRET` — session signing
- `GOOGLE_SERVICE_ACCOUNT_*` — Sheets API auth
- `INFOBIP_API_KEY`, `INFOBIP_BASE_URL`
- `FB_APP_*` — CAPI credentials

Per-Vercel-deployment; never commit.
