# Leads Control Center Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable WhatsApp lead management dashboard that reads leads from Google Sheets, sends messages via Infobip, tracks delivery receipts, and feeds conversion events to Facebook CAPI — configurable per client.

**Architecture:** Next.js 14 App Router with Tailwind CSS (RTL support). All client-specific config lives in `client.config.ts`. Google Sheets is source of truth for lead data. Infobip handles WhatsApp messaging. Facebook CAPI receives conversion events. Each client gets a separate Vercel deployment with its own config.

**Tech Stack:** Next.js 14, Tailwind CSS + tailwindcss-rtl, Google Sheets API v4, Infobip WhatsApp API, Facebook Conversions API, jose (JWT cookies), bcryptjs

**Spec:** `docs/superpowers/specs/2026-03-11-leads-control-center-design.md`

---

## Chunk 1: Scaffolding, Config, i18n, Auth

### Task 1: Next.js Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.js`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `app/globals.css`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd "/Users/a/מכינת גוונא/ניהול לידים"
npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-npm
```

Select defaults when prompted. This creates the full Next.js scaffold.

- [ ] **Step 2: Install additional dependencies**

```bash
npm install tailwindcss-rtl bcryptjs jose googleapis
npm install -D @types/bcryptjs
```

- `tailwindcss-rtl` — RTL-aware Tailwind utilities
- `bcryptjs` — password hashing for auth
- `jose` — JWT signing/verification for session cookies
- `googleapis` — Google Sheets API client

- [ ] **Step 3: Configure Tailwind for RTL + brand colors**

Update `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";
import rtl from "tailwindcss-rtl";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "var(--brand-primary)",
          sky: "var(--brand-secondary)",
          orange: "var(--brand-accent)",
          "orange-light": "var(--brand-accent-light)",
        },
      },
    },
  },
  plugins: [rtl],
};
export default config;
```

- [ ] **Step 4: Verify dev server starts**

```bash
npm run dev
```

Expected: Server starts on http://localhost:3000, default Next.js page renders.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 14 with Tailwind RTL support"
```

---

### Task 2: Client Config System

**Files:**
- Create: `client.config.ts`
- Create: `lib/config.ts` (typed helper to access config)

- [ ] **Step 1: Create the client config file**

Create `client.config.ts` at project root:

```ts
export interface ClientConfig {
  name: string;
  slug: string;
  logo: string;
  locale: "he" | "en";
  dir: "rtl" | "ltr";
  brand: {
    primary: string;
    secondary: string;
    accent: string;
    accentLight: string;
    background: string;
  };
  statuses: Array<{
    key: string;
    label: string;
    color: "orange" | "blue" | "green" | "red" | "gray";
  }>;
  features: {
    triggers: boolean;
    capi: boolean;
    multiSender: boolean;
    webhookFbLeads: boolean;
  };
  integrations: {
    infobip: { enabled: boolean };
    capi: { enabled: boolean };
    sheets: { enabled: boolean };
  };
}

export const clientConfig: ClientConfig = {
  name: "מכינת גוונא",
  slug: "gavna",
  logo: "/logo.png",
  locale: "he",
  dir: "rtl",
  brand: {
    primary: "#1d2752",
    secondary: "#0EA5E9",
    accent: "#d9642c",
    accentLight: "#ec9e3f",
    background: "#ffffff",
  },
  statuses: [
    { key: "new", label: "חדש", color: "orange" },
    { key: "sent", label: "נשלח", color: "blue" },
    { key: "read", label: "נקרא", color: "green" },
    { key: "qualified", label: "מוסמך", color: "red" },
  ],
  features: {
    triggers: true,
    capi: true,
    multiSender: false,
    webhookFbLeads: true,
  },
  integrations: {
    infobip: { enabled: true },
    capi: { enabled: true },
    sheets: { enabled: true },
  },
};
```

- [ ] **Step 2: Create config helper**

Create `lib/config.ts`:

```ts
import { clientConfig } from "@/client.config";

export function getConfig() {
  return clientConfig;
}

export function getStatusByKey(key: string) {
  return clientConfig.statuses.find((s) => s.key === key);
}

export function isFeatureEnabled(feature: keyof typeof clientConfig.features) {
  return clientConfig.features[feature];
}
```

- [ ] **Step 3: Commit**

```bash
git add client.config.ts lib/config.ts
git commit -m "feat: add typed client config system"
```

---

### Task 3: i18n System

**Files:**
- Create: `lib/i18n/index.ts`
- Create: `lib/i18n/dictionaries/he.json`
- Create: `lib/i18n/dictionaries/en.json`

- [ ] **Step 1: Create Hebrew dictionary**

Create `lib/i18n/dictionaries/he.json`:

```json
{
  "app.title": "מרכז ניהול לידים",
  "nav.dashboard": "לוח בקרה",
  "nav.templates": "תבניות",
  "nav.settings": "הגדרות",
  "nav.logout": "התנתק",
  "stats.newToday": "לידים חדשים היום",
  "stats.messagesSent": "הודעות נשלחו",
  "stats.readReceipts": "נקראו",
  "stats.qualified": "מוסמכים",
  "leads.table.name": "שם",
  "leads.table.phone": "טלפון",
  "leads.table.source": "מקור",
  "leads.table.status": "סטטוס",
  "leads.table.lastMessage": "הודעה אחרונה",
  "leads.table.actions": "פעולות",
  "leads.table.empty": "אין לידים להצגה",
  "leads.source.facebook": "פייסבוק",
  "leads.source.instagram": "אינסטגרם",
  "actions.send": "שלח הודעה",
  "actions.qualify": "סמן כמוסמך",
  "actions.sendAndQualify": "שלח וסמן",
  "actions.viewDetails": "פרטים",
  "templates.title": "ניהול תבניות",
  "templates.sync": "סנכרן מ-Infobip",
  "templates.preview": "תצוגה מקדימה",
  "templates.mapping": "מיפוי משתנים",
  "templates.noTemplates": "אין תבניות. לחץ סנכרן.",
  "settings.title": "הגדרות",
  "settings.senders": "מספרי שליחה",
  "settings.integrations": "חיבורים",
  "settings.columns": "מיפוי עמודות",
  "settings.capiConfig": "הגדרות CAPI",
  "login.title": "התחברות",
  "login.password": "סיסמה",
  "login.submit": "כניסה",
  "login.error": "סיסמה שגויה",
  "common.loading": "טוען...",
  "common.error": "שגיאה",
  "common.save": "שמור",
  "common.cancel": "ביטול",
  "common.confirm": "אישור",
  "common.search": "חיפוש",
  "common.refresh": "רענן"
}
```

- [ ] **Step 2: Create English dictionary**

Create `lib/i18n/dictionaries/en.json`:

```json
{
  "app.title": "Lead Control Center",
  "nav.dashboard": "Dashboard",
  "nav.templates": "Templates",
  "nav.settings": "Settings",
  "nav.logout": "Logout",
  "stats.newToday": "New Leads Today",
  "stats.messagesSent": "Messages Sent",
  "stats.readReceipts": "Read",
  "stats.qualified": "Qualified",
  "leads.table.name": "Name",
  "leads.table.phone": "Phone",
  "leads.table.source": "Source",
  "leads.table.status": "Status",
  "leads.table.lastMessage": "Last Message",
  "leads.table.actions": "Actions",
  "leads.table.empty": "No leads to display",
  "leads.source.facebook": "Facebook",
  "leads.source.instagram": "Instagram",
  "actions.send": "Send Message",
  "actions.qualify": "Mark Qualified",
  "actions.sendAndQualify": "Send & Qualify",
  "actions.viewDetails": "Details",
  "templates.title": "Template Manager",
  "templates.sync": "Sync from Infobip",
  "templates.preview": "Preview",
  "templates.mapping": "Variable Mapping",
  "templates.noTemplates": "No templates. Click sync.",
  "settings.title": "Settings",
  "settings.senders": "Sender Numbers",
  "settings.integrations": "Integrations",
  "settings.columns": "Column Mapping",
  "settings.capiConfig": "CAPI Configuration",
  "login.title": "Login",
  "login.password": "Password",
  "login.submit": "Sign In",
  "login.error": "Wrong password",
  "common.loading": "Loading...",
  "common.error": "Error",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.search": "Search",
  "common.refresh": "Refresh"
}
```

- [ ] **Step 3: Create i18n helper**

Create `lib/i18n/index.ts`:

```ts
import he from "./dictionaries/he.json";
import en from "./dictionaries/en.json";
import { clientConfig } from "@/client.config";

const dictionaries = { he, en } as const;

type DictionaryKey = keyof typeof he;

export function t(key: DictionaryKey): string {
  const dict = dictionaries[clientConfig.locale];
  return dict[key] || key;
}

export function getDictionary() {
  return dictionaries[clientConfig.locale];
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/i18n/
git commit -m "feat: add i18n system with Hebrew and English dictionaries"
```

---

### Task 4: Root Layout with Dynamic Branding

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Create: `app/page.tsx` (placeholder)

- [ ] **Step 1: Update globals.css with brand CSS variables**

Replace `app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --brand-primary: #1d2752;
  --brand-secondary: #0EA5E9;
  --brand-accent: #d9642c;
  --brand-accent-light: #ec9e3f;
  --brand-background: #ffffff;
}

body {
  background: var(--brand-background);
  color: #1a1a1a;
}
```

Note: CSS variables are set as defaults here. The layout.tsx will inject client-specific values via inline style, overriding these defaults.

- [ ] **Step 2: Update root layout**

Replace `app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { clientConfig } from "@/client.config";
import { t } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: clientConfig.name,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const brandVars = {
    "--brand-primary": clientConfig.brand.primary,
    "--brand-secondary": clientConfig.brand.secondary,
    "--brand-accent": clientConfig.brand.accent,
    "--brand-accent-light": clientConfig.brand.accentLight,
    "--brand-background": clientConfig.brand.background,
  } as React.CSSProperties;

  return (
    <html lang={clientConfig.locale} dir={clientConfig.dir}>
      <body style={brandVars}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create placeholder home page**

Replace `app/page.tsx` with:

```tsx
import { t } from "@/lib/i18n";

export default function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <h1 className="text-3xl font-bold text-brand-navy">
        {t("app.title")}
      </h1>
    </div>
  );
}
```

- [ ] **Step 4: Verify brand colors and RTL render**

```bash
npm run dev
```

Visit http://localhost:3000. Expected: title "מרכז ניהול לידים" centered, navy color, RTL direction on the HTML element.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx app/globals.css app/page.tsx
git commit -m "feat: root layout with dynamic brand colors and RTL"
```

---

### Task 5: Auth System

**Files:**
- Create: `lib/auth.ts`
- Create: `middleware.ts`
- Create: `app/login/page.tsx`
- Create: `components/LoginForm.tsx`
- Create: `app/api/auth/route.ts`
- Create: `.env.local` (template)

- [ ] **Step 1: Create .env.local template**

Create `.env.example` (not .env.local itself — that holds real secrets):

```env
# Auth
CLIENT_PASSWORD_HASH=           # bcrypt hash of the dashboard password

# Google Sheets
GOOGLE_SHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=

# Infobip
INFOBIP_API_KEY=
INFOBIP_BASE_URL=               # e.g. https://xxxxx.api.infobip.com
INFOBIP_SENDER=                 # default WhatsApp sender number

# Facebook CAPI
FB_PIXEL_ID=
FB_ACCESS_TOKEN=
FB_TEST_EVENT_CODE=             # optional, for testing

# Auth cookie
AUTH_SECRET=                    # random 32+ char string for JWT signing
```

- [ ] **Step 2: Create auth library**

Create `lib/auth.ts`:

```ts
import { SignJWT, jwtVerify } from "jose";
import { compare } from "bcryptjs";
import { cookies } from "next/headers";

const SESSION_COOKIE = "leads_session";
const SESSION_EXPIRY_DAYS = 7;

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET env var is required");
  return new TextEncoder().encode(secret);
}

export async function verifyPassword(password: string): Promise<boolean> {
  const hash = process.env.CLIENT_PASSWORD_HASH;
  if (!hash) throw new Error("CLIENT_PASSWORD_HASH env var is required");
  return compare(password, hash);
}

export async function createSession(): Promise<string> {
  const token = await new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SESSION_EXPIRY_DAYS}d`)
    .setIssuedAt()
    .sign(getSecret());
  return token;
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export function getSessionCookie(): string | undefined {
  const cookieStore = cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

export { SESSION_COOKIE, SESSION_EXPIRY_DAYS };
```

- [ ] **Step 3: Create auth API route**

Create `app/api/auth/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, createSession, SESSION_COOKIE, SESSION_EXPIRY_DAYS } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const valid = await verifyPassword(password);
  if (!valid) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = await createSession();
  const response = NextResponse.json({ success: true });

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    path: "/",
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
```

- [ ] **Step 4: Create middleware**

Create `middleware.ts` at project root:

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/webhooks"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static files
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.endsWith(".png") || pathname.endsWith(".ico")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const valid = await verifySession(token);
  if (!valid) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 5: Create LoginForm component**

Create `components/LoginForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError(t("login.error"));
      }
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          {t("login.password")}
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-sky focus:border-transparent outline-none"
          required
          autoFocus
        />
      </div>
      {error && (
        <p className="text-red-500 text-sm">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 bg-brand-navy text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {loading ? t("common.loading") : t("login.submit")}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Create login page**

Create `app/login/page.tsx`:

```tsx
import { clientConfig } from "@/client.config";
import { t } from "@/lib/i18n";
import LoginForm from "@/components/LoginForm";
import Image from "next/image";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          {clientConfig.logo && (
            <Image
              src={clientConfig.logo}
              alt={clientConfig.name}
              width={80}
              height={80}
              className="rounded-lg"
            />
          )}
          <h1 className="text-xl font-bold text-brand-navy">
            {t("login.title")}
          </h1>
          <p className="text-gray-500 text-sm">{clientConfig.name}</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Generate a test password hash and set .env.local**

```bash
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('test123', 10).then(h => console.log(h))"
```

Create `.env.local` with:
```
CLIENT_PASSWORD_HASH=<paste the hash from above>
AUTH_SECRET=change-me-to-a-random-32-char-string-in-production
```

Also ensure `.env.local` is in `.gitignore` (Next.js does this by default).

- [ ] **Step 8: Verify auth flow**

```bash
npm run dev
```

1. Visit http://localhost:3000 → should redirect to /login
2. Enter wrong password → should show error
3. Enter "test123" → should redirect to dashboard
4. Refresh page → should stay logged in (cookie persists)

- [ ] **Step 9: Commit**

```bash
git add .env.example lib/auth.ts middleware.ts app/api/auth/route.ts app/login/page.tsx components/LoginForm.tsx
git commit -m "feat: add password auth with cookie session"
```

---

## Chunk 2: Google Sheets Integration & Dashboard UI

### Task 6: Phone Number Normalization Utility

**Files:**
- Create: `lib/phone.ts`

- [ ] **Step 1: Create phone normalization utility**

Create `lib/phone.ts`:

```ts
import { clientConfig } from "@/client.config";

const COUNTRY_CODES: Record<string, string> = {
  he: "972",
  en: "1",
};

/**
 * Normalize any phone number to E.164 format.
 * Examples:
 *   050-1234567     → +972501234567  (locale: he)
 *   0501234567      → +972501234567  (locale: he)
 *   +972501234567   → +972501234567
 *   (555) 123-4567  → +15551234567   (locale: en)
 */
export function normalizePhone(phone: string, locale?: string): string {
  // Strip everything except digits and leading +
  const cleaned = phone.replace(/[^\d+]/g, "");

  // Already in E.164 format
  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  const countryCode = COUNTRY_CODES[locale || clientConfig.locale] || "972";

  // Israeli format: starts with 0, remove leading 0, prepend +972
  if (countryCode === "972" && cleaned.startsWith("0")) {
    return `+972${cleaned.slice(1)}`;
  }

  // US format: 10 digits, prepend +1
  if (countryCode === "1" && cleaned.length === 10) {
    return `+1${cleaned}`;
  }

  // US format: 11 digits starting with 1
  if (countryCode === "1" && cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+${cleaned}`;
  }

  // Fallback: prepend + and country code
  if (cleaned.startsWith(countryCode)) {
    return `+${cleaned}`;
  }

  return `+${countryCode}${cleaned}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/phone.ts
git commit -m "feat: add phone number E.164 normalization utility"
```

---

### Task 7: Google Sheets Integration

**Files:**
- Create: `lib/sheets.ts`
- Create: `config/columns.json`
- Create: `app/api/leads/route.ts`

- [ ] **Step 1: Create column mapping config**

Create `config/columns.json`:

```json
{
  "sheetName": "לידים",
  "columns": {
    "name": { "index": 0, "header": "שם מלא" },
    "phone": { "index": 1, "header": "טלפון" },
    "email": { "index": 2, "header": "אימייל" },
    "source": { "index": 3, "header": "מקור" },
    "status": { "index": 4, "header": "סטטוס" },
    "lastMessage": { "index": 5, "header": "הודעה אחרונה" },
    "lastMessageDate": { "index": 6, "header": "תאריך הודעה" },
    "messageId": { "index": 7, "header": "מזהה הודעה" },
    "createdAt": { "index": 8, "header": "תאריך יצירה" },
    "notes": { "index": 9, "header": "הערות" }
  }
}
```

- [ ] **Step 2: Create Google Sheets library**

Create `lib/sheets.ts`:

```ts
import { google, sheets_v4 } from "googleapis";
import columnsConfig from "@/config/columns.json";

export interface Lead {
  row: number; // 1-based row number in Sheet (for updates)
  name: string;
  phone: string;
  email: string;
  source: string;
  status: string;
  lastMessage: string;
  lastMessageDate: string;
  messageId: string;
  createdAt: string;
  notes: string;
}

function getSheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID env var is required");
  return id;
}

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error("Google service account credentials are required");
  }
  return new google.auth.JWT(email, undefined, key, [
    "https://www.googleapis.com/auth/spreadsheets",
  ]);
}

function getSheets(): sheets_v4.Sheets {
  return google.sheets({ version: "v4", auth: getAuth() });
}

function rowToLead(row: string[], rowIndex: number): Lead {
  const col = columnsConfig.columns;
  return {
    row: rowIndex,
    name: row[col.name.index] || "",
    phone: row[col.phone.index] || "",
    email: row[col.email.index] || "",
    source: row[col.source.index] || "",
    status: row[col.status.index] || "new",
    lastMessage: row[col.lastMessage.index] || "",
    lastMessageDate: row[col.lastMessageDate.index] || "",
    messageId: row[col.messageId.index] || "",
    createdAt: row[col.createdAt.index] || "",
    notes: row[col.notes.index] || "",
  };
}

export async function getLeads(): Promise<Lead[]> {
  const sheets = getSheets();
  const sheetName = columnsConfig.sheetName;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A2:Z`, // Skip header row
  });

  const rows = response.data.values || [];
  return rows.map((row, i) => rowToLead(row, i + 2)); // +2 because 1-indexed and skip header
}

export async function updateLeadCell(
  row: number,
  columnKey: keyof typeof columnsConfig.columns,
  value: string
): Promise<void> {
  const sheets = getSheets();
  const sheetName = columnsConfig.sheetName;
  const colIndex = columnsConfig.columns[columnKey].index;
  const colLetter = String.fromCharCode(65 + colIndex); // A=0, B=1, etc.

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!${colLetter}${row}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

export async function updateLeadCells(
  row: number,
  updates: Partial<Record<keyof typeof columnsConfig.columns, string>>
): Promise<void> {
  const promises = Object.entries(updates).map(([key, value]) =>
    updateLeadCell(row, key as keyof typeof columnsConfig.columns, value)
  );
  await Promise.all(promises);
}

export async function appendLead(
  data: Partial<Record<keyof typeof columnsConfig.columns, string>>
): Promise<void> {
  const sheets = getSheets();
  const sheetName = columnsConfig.sheetName;
  const col = columnsConfig.columns;

  // Build row array
  const maxIndex = Math.max(...Object.values(col).map((c) => c.index));
  const row = new Array(maxIndex + 1).fill("");

  for (const [key, value] of Object.entries(data)) {
    const colConfig = col[key as keyof typeof col];
    if (colConfig && value) {
      row[colConfig.index] = value;
    }
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `${sheetName}!A:Z`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}
```

- [ ] **Step 3: Create leads API route**

Create `app/api/leads/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getLeads } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const leads = await getLeads();
    return NextResponse.json({ leads });
  } catch (error) {
    console.error("Failed to fetch leads:", error);
    return NextResponse.json(
      { error: "Failed to fetch leads" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/sheets.ts config/columns.json app/api/leads/route.ts
git commit -m "feat: add Google Sheets integration and leads API"
```

---

### Task 8: Dashboard Layout with Navigation

**Files:**
- Create: `components/NavBar.tsx`
- Create: `app/(dashboard)/layout.tsx`
- Move: `app/page.tsx` → `app/(dashboard)/page.tsx`

We use a Next.js route group `(dashboard)` so the nav bar wraps all authenticated pages but not the login page.

- [ ] **Step 1: Create NavBar component**

Create `components/NavBar.tsx`:

```tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { clientConfig } from "@/client.config";
import { t } from "@/lib/i18n";
import { isFeatureEnabled } from "@/lib/config";

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  const links = [
    { href: "/", label: t("nav.dashboard") },
    { href: "/templates", label: t("nav.templates") },
    ...(isFeatureEnabled("triggers")
      ? [{ href: "/settings", label: t("nav.settings") }]
      : [{ href: "/settings", label: t("nav.settings") }]),
  ];

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="bg-brand-navy text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo + Name */}
          <div className="flex items-center gap-3">
            {clientConfig.logo && (
              <Image
                src={clientConfig.logo}
                alt={clientConfig.name}
                width={36}
                height={36}
                className="rounded"
              />
            )}
            <span className="font-bold text-lg">{clientConfig.name}</span>
          </div>

          {/* Nav Links */}
          <div className="flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === link.href
                    ? "bg-white/20 text-white"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors ms-2"
            >
              {t("nav.logout")}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Create dashboard layout**

Create `app/(dashboard)/layout.tsx`:

```tsx
import NavBar from "@/components/NavBar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Move page.tsx into dashboard route group**

Move (or recreate) `app/page.tsx` → `app/(dashboard)/page.tsx`:

```tsx
import { t } from "@/lib/i18n";

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-navy mb-6">
        {t("nav.dashboard")}
      </h1>
      <p className="text-gray-500">{t("common.loading")}</p>
    </div>
  );
}
```

Delete the old `app/page.tsx` if it still exists at the root.

- [ ] **Step 4: Verify navigation renders**

```bash
npm run dev
```

Visit http://localhost:3000 (after login). Expected: Navy nav bar with logo, client name, nav links. Dashboard placeholder below.

- [ ] **Step 5: Commit**

```bash
git add components/NavBar.tsx app/
git commit -m "feat: add dashboard layout with navigation bar"
```

---

### Task 9: StatusBadge Component

**Files:**
- Create: `components/StatusBadge.tsx`

- [ ] **Step 1: Create StatusBadge**

Create `components/StatusBadge.tsx`:

```tsx
import { clientConfig } from "@/client.config";

const colorClasses: Record<string, string> = {
  orange: "bg-orange-100 text-orange-700",
  blue: "bg-blue-100 text-blue-700",
  green: "bg-green-100 text-green-700",
  red: "bg-red-100 text-red-700",
  gray: "bg-gray-100 text-gray-700",
};

interface StatusBadgeProps {
  statusKey: string;
}

export default function StatusBadge({ statusKey }: StatusBadgeProps) {
  const status = clientConfig.statuses.find((s) => s.key === statusKey);
  if (!status) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
        {statusKey}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        colorClasses[status.color] || colorClasses.gray
      }`}
    >
      {status.label}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/StatusBadge.tsx
git commit -m "feat: add config-driven StatusBadge component"
```

---

### Task 10: StatsBar Component

**Files:**
- Create: `components/StatsBar.tsx`

- [ ] **Step 1: Create StatsBar**

Create `components/StatsBar.tsx`:

```tsx
import { t } from "@/lib/i18n";

interface StatsBarProps {
  newToday: number;
  messagesSent: number;
  readReceipts: number;
  qualified: number;
}

export default function StatsBar({ newToday, messagesSent, readReceipts, qualified }: StatsBarProps) {
  const stats = [
    { label: t("stats.newToday"), value: newToday, color: "text-brand-orange" },
    { label: t("stats.messagesSent"), value: messagesSent, color: "text-brand-sky" },
    { label: t("stats.readReceipts"), value: readReceipts, color: "text-green-600" },
    { label: t("stats.qualified"), value: qualified, color: "text-brand-orange" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
        >
          <p className="text-sm text-gray-500">{stat.label}</p>
          <p className={`text-3xl font-bold mt-1 ${stat.color}`}>
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/StatsBar.tsx
git commit -m "feat: add StatsBar component"
```

---

### Task 11: LeadTable Component

**Files:**
- Create: `components/LeadTable.tsx`

- [ ] **Step 1: Create LeadTable**

Create `components/LeadTable.tsx`:

```tsx
"use client";

import { t } from "@/lib/i18n";
import StatusBadge from "./StatusBadge";
import type { Lead } from "@/lib/sheets";

interface LeadTableProps {
  leads: Lead[];
  onSendMessage: (lead: Lead) => void;
  onQualify: (lead: Lead) => void;
}

function SourceBadge({ source }: { source: string }) {
  const isFacebook = source?.toLowerCase().includes("facebook") || source?.toLowerCase().includes("fb");
  const isInstagram = source?.toLowerCase().includes("instagram") || source?.toLowerCase().includes("ig");

  if (isFacebook) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600">
        {t("leads.source.facebook")}
      </span>
    );
  }
  if (isInstagram) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-pink-50 text-pink-600">
        {t("leads.source.instagram")}
      </span>
    );
  }
  return <span className="text-sm text-gray-500">{source || "—"}</span>;
}

export default function LeadTable({ leads, onSendMessage, onQualify }: LeadTableProps) {
  if (leads.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
        <p className="text-gray-400">{t("leads.table.empty")}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-start px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                {t("leads.table.name")}
              </th>
              <th className="text-start px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                {t("leads.table.phone")}
              </th>
              <th className="text-start px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                {t("leads.table.source")}
              </th>
              <th className="text-start px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                {t("leads.table.status")}
              </th>
              <th className="text-start px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                {t("leads.table.lastMessage")}
              </th>
              <th className="text-start px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                {t("leads.table.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr
                key={lead.row}
                className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
              >
                <td className="px-4 py-3">
                  <span className="font-medium text-gray-900">{lead.name}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-600 font-mono" dir="ltr">
                    {lead.phone}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <SourceBadge source={lead.source} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge statusKey={lead.status} />
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-500 truncate max-w-[200px] block">
                    {lead.lastMessage || "—"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => onSendMessage(lead)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-sky text-white hover:opacity-90 transition-opacity"
                    >
                      {t("actions.send")}
                    </button>
                    {lead.status !== "qualified" && (
                      <button
                        onClick={() => onQualify(lead)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-orange text-white hover:opacity-90 transition-opacity"
                      >
                        {t("actions.qualify")}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/LeadTable.tsx
git commit -m "feat: add LeadTable component with source/status badges"
```

---

### Task 12: Dashboard Page (Wiring It All Together)

**Files:**
- Modify: `app/(dashboard)/page.tsx`
- Create: `components/DashboardClient.tsx`

- [ ] **Step 1: Create the client-side dashboard wrapper**

Create `components/DashboardClient.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import StatsBar from "./StatsBar";
import LeadTable from "./LeadTable";
import { t } from "@/lib/i18n";
import { clientConfig } from "@/client.config";
import type { Lead } from "@/lib/sheets";

const POLL_INTERVAL = 30_000; // 30 seconds

export default function DashboardClient() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/leads");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setLeads(data.leads);
      setError("");
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
    const interval = setInterval(fetchLeads, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchLeads]);

  // Compute stats
  const today = new Date().toLocaleDateString(clientConfig.locale === "he" ? "he-IL" : "en-US");
  const newToday = leads.filter(
    (l) => l.status === "new" && l.createdAt?.includes(today)
  ).length;
  const messagesSent = leads.filter((l) =>
    ["sent", "read", "qualified"].includes(l.status)
  ).length;
  const readReceipts = leads.filter((l) =>
    ["read", "qualified"].includes(l.status)
  ).length;
  const qualified = leads.filter((l) => l.status === "qualified").length;

  function handleSendMessage(lead: Lead) {
    // Will be implemented in Chunk 3 (Template Manager + Send flow)
    console.log("Send message to:", lead.name);
  }

  function handleQualify(lead: Lead) {
    // Will be implemented in Chunk 4 (Qualify flow)
    console.log("Qualify:", lead.name);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-400">{t("common.loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-red-500">{error}</p>
        <button
          onClick={fetchLeads}
          className="px-4 py-2 bg-brand-navy text-white rounded-lg text-sm"
        >
          {t("common.refresh")}
        </button>
      </div>
    );
  }

  return (
    <div>
      <StatsBar
        newToday={newToday}
        messagesSent={messagesSent}
        readReceipts={readReceipts}
        qualified={qualified}
      />
      <LeadTable
        leads={leads}
        onSendMessage={handleSendMessage}
        onQualify={handleQualify}
      />
    </div>
  );
}
```

- [ ] **Step 2: Update dashboard page**

Replace `app/(dashboard)/page.tsx`:

```tsx
import { t } from "@/lib/i18n";
import DashboardClient from "@/components/DashboardClient";

export default function DashboardPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">
          {t("nav.dashboard")}
        </h1>
      </div>
      <DashboardClient />
    </div>
  );
}
```

- [ ] **Step 3: Verify dashboard with mock data or real Sheet**

If you have a Google Sheet configured in `.env.local`, visit http://localhost:3000. Expected: Stats bar at top, lead table below with data from Sheet.

If no Sheet is configured yet, the error state should show with a refresh button.

- [ ] **Step 4: Commit**

```bash
git add components/DashboardClient.tsx app/\(dashboard\)/page.tsx
git commit -m "feat: wire up dashboard with stats bar, lead table, and 30s polling"
```

---

## Chunk 3: Infobip Integration & Template Manager

### Task 13: Infobip Client Library

**Files:**
- Create: `lib/infobip.ts`

- [ ] **Step 1: Create Infobip API client**

Create `lib/infobip.ts`:

```ts
import { normalizePhone } from "./phone";

interface InfobipConfig {
  apiKey: string;
  baseUrl: string;
  sender: string;
}

function getConfig(): InfobipConfig {
  const apiKey = process.env.INFOBIP_API_KEY;
  const baseUrl = process.env.INFOBIP_BASE_URL;
  const sender = process.env.INFOBIP_SENDER;
  if (!apiKey || !baseUrl || !sender) {
    throw new Error("Infobip env vars (INFOBIP_API_KEY, INFOBIP_BASE_URL, INFOBIP_SENDER) are required");
  }
  return { apiKey, baseUrl, sender };
}

async function infobipFetch(path: string, options: RequestInit = {}) {
  const config = getConfig();
  const res = await fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `App ${config.apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Infobip API error ${res.status}: ${body}`);
  }
  return res.json();
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

export async function getTemplates(): Promise<WhatsAppTemplate[]> {
  const config = getConfig();
  const data = await infobipFetch(
    `/whatsapp/2/senders/${config.sender}/templates`
  );
  // Filter to only APPROVED templates
  return (data.templates || []).filter(
    (t: WhatsAppTemplate) => t.status === "APPROVED"
  );
}

export interface SendMessageParams {
  to: string; // phone number (any format, will be normalized)
  templateName: string;
  language: string;
  placeholders: string[]; // ordered list matching {{1}}, {{2}}, etc.
  sender?: string; // override default sender
}

export interface SendMessageResult {
  messageId: string;
  status: string;
}

export async function sendTemplateMessage(
  params: SendMessageParams
): Promise<SendMessageResult> {
  const config = getConfig();
  const to = normalizePhone(params.to);

  const body = {
    messages: [
      {
        from: params.sender || config.sender,
        to,
        content: {
          templateName: params.templateName,
          templateData: {
            body: {
              placeholders: params.placeholders,
            },
          },
          language: params.language,
        },
      },
    ],
  };

  const data = await infobipFetch("/whatsapp/1/message/template", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const message = data.messages?.[0];
  return {
    messageId: message?.messageId || "",
    status: message?.status?.name || "UNKNOWN",
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/infobip.ts
git commit -m "feat: add Infobip API client (template listing + message sending)"
```

---

### Task 14: Template Sync API Route

**Files:**
- Create: `app/api/templates/sync/route.ts`

- [ ] **Step 1: Create template sync API**

Create `app/api/templates/sync/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getTemplates } from "@/lib/infobip";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const templates = await getTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Failed to sync templates:", error);
    return NextResponse.json(
      { error: "Failed to sync templates from Infobip" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/templates/sync/route.ts
git commit -m "feat: add template sync API route"
```

---

### Task 15: Template Mappings Config

**Files:**
- Create: `config/template-mappings.json`
- Create: `app/api/templates/mappings/route.ts`

- [ ] **Step 1: Create initial mappings file**

Create `config/template-mappings.json`:

```json
{
  "mappings": {}
}
```

The structure when populated:
```json
{
  "mappings": {
    "welcome_template": {
      "language": "he",
      "placeholders": {
        "1": "name",
        "2": "source"
      }
    }
  }
}
```

- [ ] **Step 2: Create mappings API route (read + write)**

Create `app/api/templates/mappings/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const MAPPINGS_PATH = path.join(process.cwd(), "config", "template-mappings.json");

export async function GET() {
  try {
    const data = await readFile(MAPPINGS_PATH, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json({ mappings: {} });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    await writeFile(MAPPINGS_PATH, JSON.stringify(body, null, 2), "utf-8");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save mappings:", error);
    return NextResponse.json(
      { error: "Failed to save mappings" },
      { status: 500 }
    );
  }
}
```

Note: Writing to `config/template-mappings.json` works in development. In production on Vercel, the filesystem is read-only. For production, mappings should be stored in a Google Sheet tab or environment variable. This is acceptable for MVP — we can migrate storage later.

- [ ] **Step 3: Commit**

```bash
git add config/template-mappings.json app/api/templates/mappings/route.ts
git commit -m "feat: add template variable mappings config and API"
```

---

### Task 16: MessagePreview Component

**Files:**
- Create: `components/MessagePreview.tsx`

- [ ] **Step 1: Create WhatsApp-style message preview**

Create `components/MessagePreview.tsx`:

```tsx
interface MessagePreviewProps {
  text: string;
  direction?: "rtl" | "ltr";
}

export default function MessagePreview({ text, direction = "rtl" }: MessagePreviewProps) {
  return (
    <div className="bg-gray-100 rounded-xl p-4 max-w-sm">
      <div
        dir={direction}
        className="bg-[#DCF8C6] rounded-lg rounded-tl-none px-3 py-2 shadow-sm text-sm leading-relaxed"
      >
        {text}
        <div className="flex justify-end mt-1">
          <span className="text-[10px] text-gray-500">12:00 ✓✓</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/MessagePreview.tsx
git commit -m "feat: add WhatsApp-style message preview component"
```

---

### Task 17: Template Manager UI

**Files:**
- Create: `components/TemplateManager.tsx`
- Create: `app/(dashboard)/templates/page.tsx`

- [ ] **Step 1: Create TemplateManager component**

Create `components/TemplateManager.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { t } from "@/lib/i18n";
import { clientConfig } from "@/client.config";
import MessagePreview from "./MessagePreview";
import type { WhatsAppTemplate } from "@/lib/infobip";
import columnsConfig from "@/config/columns.json";

interface TemplateMappings {
  mappings: Record<
    string,
    { language: string; placeholders: Record<string, string> }
  >;
}

export default function TemplateManager() {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [mappings, setMappings] = useState<TemplateMappings>({ mappings: {} });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const columnKeys = Object.keys(columnsConfig.columns);

  useEffect(() => {
    fetchMappings();
  }, []);

  async function fetchMappings() {
    const res = await fetch("/api/templates/mappings");
    if (res.ok) {
      setMappings(await res.json());
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/templates/sync");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates);
      }
    } finally {
      setSyncing(false);
    }
  }

  async function saveMappings(updated: TemplateMappings) {
    setMappings(updated);
    await fetch("/api/templates/mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
  }

  function handlePlaceholderChange(
    templateName: string,
    language: string,
    placeholderIndex: string,
    columnKey: string
  ) {
    const updated = { ...mappings };
    if (!updated.mappings[templateName]) {
      updated.mappings[templateName] = { language, placeholders: {} };
    }
    updated.mappings[templateName].placeholders[placeholderIndex] = columnKey;
    saveMappings(updated);
  }

  // Extract placeholder count from template body text
  function getPlaceholders(template: WhatsAppTemplate): string[] {
    const matches = template.structure.body.text.match(/\{\{(\d+)\}\}/g) || [];
    return [...new Set(matches.map((m) => m.replace(/[{}]/g, "")))];
  }

  function getPreviewText(template: WhatsAppTemplate): string {
    let text = template.structure.body.text;
    const mapping = mappings.mappings[template.name];
    if (mapping) {
      const placeholders = getPlaceholders(template);
      placeholders.forEach((p) => {
        const columnKey = mapping.placeholders[p];
        const header =
          columnsConfig.columns[columnKey as keyof typeof columnsConfig.columns]
            ?.header || `{{${p}}}`;
        text = text.replace(`{{${p}}}`, `[${header}]`);
      });
    }
    return text;
  }

  return (
    <div className="space-y-6">
      {/* Sync button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-brand-navy">
          {t("templates.title")}
        </h2>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 bg-brand-sky text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {syncing ? t("common.loading") : t("templates.sync")}
        </button>
      </div>

      {templates.length === 0 && !loading && (
        <p className="text-gray-400 text-center py-8">
          {t("templates.noTemplates")}
        </p>
      )}

      {/* Template list */}
      <div className="grid gap-4">
        {templates.map((template) => {
          const placeholders = getPlaceholders(template);
          const isSelected = selectedTemplate === template.name;

          return (
            <div
              key={template.name}
              className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
            >
              {/* Template header */}
              <button
                onClick={() =>
                  setSelectedTemplate(isSelected ? null : template.name)
                }
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-900">
                    {template.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    {template.language}
                  </span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">
                  {template.status}
                </span>
              </button>

              {/* Expanded: mapping + preview */}
              {isSelected && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-4">
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Variable mapping */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-gray-700">
                        {t("templates.mapping")}
                      </h3>
                      {placeholders.length === 0 && (
                        <p className="text-sm text-gray-400">
                          No placeholders in this template.
                        </p>
                      )}
                      {placeholders.map((p) => (
                        <div key={p} className="flex items-center gap-3">
                          <span className="text-sm font-mono text-gray-500 w-12">
                            {`{{${p}}}`}
                          </span>
                          <select
                            value={
                              mappings.mappings[template.name]?.placeholders[
                                p
                              ] || ""
                            }
                            onChange={(e) =>
                              handlePlaceholderChange(
                                template.name,
                                template.language,
                                p,
                                e.target.value
                              )
                            }
                            className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-sky focus:border-transparent outline-none"
                          >
                            <option value="">— Select column —</option>
                            {columnKeys.map((key) => (
                              <option key={key} value={key}>
                                {
                                  columnsConfig.columns[
                                    key as keyof typeof columnsConfig.columns
                                  ].header
                                }
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>

                    {/* Preview */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-gray-700">
                        {t("templates.preview")}
                      </h3>
                      <MessagePreview
                        text={getPreviewText(template)}
                        direction={clientConfig.dir}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create templates page**

Create `app/(dashboard)/templates/page.tsx`:

```tsx
import TemplateManager from "@/components/TemplateManager";

export default function TemplatesPage() {
  return <TemplateManager />;
}
```

- [ ] **Step 3: Verify template page renders**

```bash
npm run dev
```

Visit http://localhost:3000/templates. Expected: Template manager with sync button. Without Infobip credentials, sync will show an error — that's expected.

- [ ] **Step 4: Commit**

```bash
git add components/TemplateManager.tsx app/\(dashboard\)/templates/page.tsx
git commit -m "feat: add Template Manager with variable mapping and preview"
```

---

### Task 18: Send Message API Route

**Files:**
- Create: `app/api/messages/send/route.ts`

- [ ] **Step 1: Create send message API**

Create `app/api/messages/send/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { sendTemplateMessage } from "@/lib/infobip";
import { getLeads, updateLeadCells } from "@/lib/sheets";
import { readFile } from "fs/promises";
import path from "path";
import columnsConfig from "@/config/columns.json";

export async function POST(request: NextRequest) {
  try {
    const { leadRow, templateName, language, sender } = await request.json();

    if (!leadRow || !templateName) {
      return NextResponse.json(
        { error: "leadRow and templateName are required" },
        { status: 400 }
      );
    }

    // Get leads and find the target
    const leads = await getLeads();
    const lead = leads.find((l) => l.row === leadRow);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Load template mappings
    const mappingsPath = path.join(process.cwd(), "config", "template-mappings.json");
    const mappingsData = JSON.parse(await readFile(mappingsPath, "utf-8"));
    const mapping = mappingsData.mappings[templateName];

    if (!mapping) {
      return NextResponse.json(
        { error: "No variable mapping found for this template" },
        { status: 400 }
      );
    }

    // Build placeholders from mapping
    const placeholders: string[] = [];
    const sortedKeys = Object.keys(mapping.placeholders).sort(
      (a, b) => Number(a) - Number(b)
    );
    for (const key of sortedKeys) {
      const columnKey = mapping.placeholders[key];
      const value = lead[columnKey as keyof typeof lead] || "";
      placeholders.push(String(value));
    }

    // Send via Infobip
    const result = await sendTemplateMessage({
      to: lead.phone,
      templateName,
      language: language || mapping.language || "he",
      placeholders,
      sender,
    });

    // Update Sheet: status, messageId, lastMessage date
    const now = new Date().toISOString();
    await updateLeadCells(lead.row, {
      status: "sent",
      messageId: result.messageId,
      lastMessage: templateName,
      lastMessageDate: now,
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      status: result.status,
    });
  } catch (error) {
    console.error("Failed to send message:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/messages/send/route.ts
git commit -m "feat: add send message API with template variable substitution"
```

---

### Task 19: Send Message Dialog in Dashboard

**Files:**
- Create: `components/SendMessageDialog.tsx`
- Modify: `components/DashboardClient.tsx`

- [ ] **Step 1: Create SendMessageDialog**

Create `components/SendMessageDialog.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { t } from "@/lib/i18n";
import { clientConfig } from "@/client.config";
import MessagePreview from "./MessagePreview";
import type { Lead } from "@/lib/sheets";
import type { WhatsAppTemplate } from "@/lib/infobip";
import columnsConfig from "@/config/columns.json";

interface SendMessageDialogProps {
  lead: Lead;
  onClose: () => void;
  onSent: () => void;
}

interface TemplateMappings {
  mappings: Record<
    string,
    { language: string; placeholders: Record<string, string> }
  >;
}

export default function SendMessageDialog({
  lead,
  onClose,
  onSent,
}: SendMessageDialogProps) {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [mappings, setMappings] = useState<TemplateMappings>({ mappings: {} });
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/templates/sync").then((r) => r.json()),
      fetch("/api/templates/mappings").then((r) => r.json()),
    ]).then(([templatesData, mappingsData]) => {
      setTemplates(templatesData.templates || []);
      setMappings(mappingsData);
    });
  }, []);

  function getPreviewText(): string {
    const template = templates.find((t) => t.name === selectedTemplate);
    if (!template) return "";

    let text = template.structure.body.text;
    const mapping = mappings.mappings[template.name];
    if (mapping) {
      const matches = text.match(/\{\{(\d+)\}\}/g) || [];
      matches.forEach((match) => {
        const index = match.replace(/[{}]/g, "");
        const columnKey = mapping.placeholders[index];
        if (columnKey) {
          const value = lead[columnKey as keyof Lead] || "";
          text = text.replace(match, String(value));
        }
      });
    }
    return text;
  }

  async function handleSend() {
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadRow: lead.row,
          templateName: selectedTemplate,
        }),
      });
      if (res.ok) {
        onSent();
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || t("common.error"));
      }
    } catch {
      setError(t("common.error"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-navy">
            {t("actions.send")} — {lead.name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ×
          </button>
        </div>

        {/* Template selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Template
          </label>
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-sky focus:border-transparent outline-none"
          >
            <option value="">— Select template —</option>
            {templates.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.language})
              </option>
            ))}
          </select>
        </div>

        {/* Preview */}
        {selectedTemplate && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("templates.preview")}
            </label>
            <MessagePreview
              text={getPreviewText()}
              direction={clientConfig.dir}
            />
          </div>
        )}

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSend}
            disabled={!selectedTemplate || sending}
            className="px-4 py-2 bg-brand-sky text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {sending ? t("common.loading") : t("actions.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire send dialog into DashboardClient**

Update `components/DashboardClient.tsx` — add the dialog state and import:

At the top, add:
```tsx
import SendMessageDialog from "./SendMessageDialog";
```

Add state after existing state declarations:
```tsx
const [sendingTo, setSendingTo] = useState<Lead | null>(null);
```

Replace the `handleSendMessage` function:
```tsx
function handleSendMessage(lead: Lead) {
  setSendingTo(lead);
}
```

Add before the closing `</div>` of the return:
```tsx
{sendingTo && (
  <SendMessageDialog
    lead={sendingTo}
    onClose={() => setSendingTo(null)}
    onSent={fetchLeads}
  />
)}
```

- [ ] **Step 3: Commit**

```bash
git add components/SendMessageDialog.tsx components/DashboardClient.tsx
git commit -m "feat: add send message dialog with template selection and preview"
```

---

## Chunk 4: Webhooks, CAPI & Qualify Flow

### Task 20: Facebook Lead Webhook

**Files:**
- Create: `app/api/webhooks/facebook/route.ts`

- [ ] **Step 1: Create Facebook lead webhook**

Create `app/api/webhooks/facebook/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { appendLead } from "@/lib/sheets";
import { normalizePhone } from "@/lib/phone";

// Webhook verification (Facebook sends GET to verify)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.FB_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// Receive lead data
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Process each entry
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === "leadgen") {
          const leadData = change.value;

          // Extract field data from the lead
          const fieldData: Record<string, string> = {};
          for (const field of leadData.field_data || []) {
            fieldData[field.name] = field.values?.[0] || "";
          }

          // Determine source (Facebook or Instagram)
          const source = leadData.adgroup_id
            ? leadData.page_id
              ? "Facebook"
              : "Instagram"
            : "Facebook";

          // Append to Sheet
          await appendLead({
            name: fieldData.full_name || fieldData.first_name || "",
            phone: fieldData.phone_number
              ? normalizePhone(fieldData.phone_number)
              : "",
            email: fieldData.email || "",
            source,
            status: "new",
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Facebook webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Add FB_WEBHOOK_VERIFY_TOKEN to .env.example**

Add to `.env.example`:
```
FB_WEBHOOK_VERIFY_TOKEN=        # random string for Facebook webhook verification
```

- [ ] **Step 3: Commit**

```bash
git add app/api/webhooks/facebook/route.ts .env.example
git commit -m "feat: add Facebook Lead Ads webhook (verification + lead ingestion)"
```

---

### Task 21: Infobip Delivery Webhook

**Files:**
- Create: `app/api/webhooks/infobip/route.ts`

- [ ] **Step 1: Create Infobip webhook**

Create `app/api/webhooks/infobip/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getLeads, updateLeadCell } from "@/lib/sheets";

// Infobip sends delivery reports as POST
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const results = body.results || [body]; // Can be single or array

    for (const result of results) {
      const messageId = result.messageId;
      const status = result.status?.name; // DELIVERED, SEEN, FAILED, etc.

      if (!messageId || !status) continue;

      // Find lead by messageId
      const leads = await getLeads();
      const lead = leads.find((l) => l.messageId === messageId);
      if (!lead) continue;

      // Map Infobip status to our status
      let newStatus: string | null = null;
      if (status === "SEEN" || status === "READ") {
        newStatus = "read";
      } else if (status === "DELIVERED") {
        // Only update to delivered if not already read/qualified
        if (lead.status === "sent") {
          newStatus = "sent"; // Keep as sent, delivery is implicit
        }
      } else if (status === "FAILED" || status === "REJECTED") {
        newStatus = "new"; // Reset to new so they can retry
      }

      if (newStatus && newStatus !== lead.status) {
        await updateLeadCell(lead.row, "status", newStatus);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Infobip webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/webhooks/infobip/route.ts
git commit -m "feat: add Infobip delivery/read receipt webhook"
```

---

### Task 22: Facebook CAPI Client

**Files:**
- Create: `lib/capi.ts`

- [ ] **Step 1: Create CAPI client**

Create `lib/capi.ts`:

```ts
import { createHash } from "crypto";
import { isFeatureEnabled } from "./config";

interface CAPIConfig {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
}

function getConfig(): CAPIConfig | null {
  if (!isFeatureEnabled("capi")) return null;

  const pixelId = process.env.FB_PIXEL_ID;
  const accessToken = process.env.FB_ACCESS_TOKEN;
  if (!pixelId || !accessToken) return null;

  return {
    pixelId,
    accessToken,
    testEventCode: process.env.FB_TEST_EVENT_CODE,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

interface CAPIEventParams {
  eventName: string; // "Lead", "Purchase", or custom
  phone?: string;
  email?: string;
  fbc?: string;
  fbp?: string;
  sourceUrl?: string;
  customData?: Record<string, unknown>;
}

export async function sendCAPIEvent(params: CAPIEventParams): Promise<boolean> {
  const config = getConfig();
  if (!config) return false;

  const userData: Record<string, string> = {};
  if (params.phone) userData.ph = [sha256(params.phone)].toString();
  if (params.email) userData.em = [sha256(params.email)].toString();
  if (params.fbc) userData.fbc = params.fbc;
  if (params.fbp) userData.fbp = params.fbp;

  const eventData: Record<string, unknown> = {
    event_name: params.eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: "system_generated",
    user_data: userData,
  };

  if (params.sourceUrl) {
    eventData.event_source_url = params.sourceUrl;
  }

  if (params.customData) {
    eventData.custom_data = params.customData;
  }

  const body: Record<string, unknown> = {
    data: [eventData],
  };

  if (config.testEventCode) {
    body.test_event_code = config.testEventCode;
  }

  try {
    const url = `https://graph.facebook.com/v18.0/${config.pixelId}/events?access_token=${config.accessToken}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error("CAPI error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("CAPI request failed:", error);
    return false;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/capi.ts
git commit -m "feat: add Facebook CAPI client with hashed user matching"
```

---

### Task 23: One-Click Qualify API

**Files:**
- Create: `app/api/leads/qualify/route.ts`

- [ ] **Step 1: Create qualify API route**

Create `app/api/leads/qualify/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getLeads, updateLeadCells } from "@/lib/sheets";
import { sendCAPIEvent } from "@/lib/capi";

export async function POST(request: NextRequest) {
  try {
    const { leadRow, sendFollowUp, templateName } = await request.json();

    if (!leadRow) {
      return NextResponse.json(
        { error: "leadRow is required" },
        { status: 400 }
      );
    }

    // Get the lead
    const leads = await getLeads();
    const lead = leads.find((l) => l.row === leadRow);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Run all three actions in parallel
    const results = await Promise.allSettled([
      // 1. Update Sheet status to qualified
      updateLeadCells(lead.row, {
        status: "qualified",
      }),

      // 2. Send follow-up template (if requested)
      sendFollowUp && templateName
        ? fetch(new URL("/api/messages/send", request.url), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadRow, templateName }),
          })
        : Promise.resolve(null),

      // 3. Fire CAPI qualified event
      sendCAPIEvent({
        eventName: "Purchase",
        phone: lead.phone,
        email: lead.email,
      }),
    ]);

    const errors = results
      .filter((r) => r.status === "rejected")
      .map((r) => (r as PromiseRejectedResult).reason?.message || "Unknown error");

    return NextResponse.json({
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Qualify failed:", error);
    return NextResponse.json(
      { error: "Failed to qualify lead" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Wire qualify button in DashboardClient**

Update `components/DashboardClient.tsx` — replace the `handleQualify` function:

```tsx
async function handleQualify(lead: Lead) {
  try {
    const res = await fetch("/api/leads/qualify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadRow: lead.row }),
    });
    if (res.ok) {
      fetchLeads(); // Refresh
    }
  } catch (err) {
    console.error("Qualify failed:", err);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/leads/qualify/route.ts components/DashboardClient.tsx
git commit -m "feat: add one-click qualify with parallel Sheet + CAPI actions"
```

---

### Task 24: Add CAPI Event on Message Send

**Files:**
- Modify: `app/api/messages/send/route.ts`

- [ ] **Step 1: Add CAPI Lead event to send flow**

In `app/api/messages/send/route.ts`, add import at top:
```ts
import { sendCAPIEvent } from "@/lib/capi";
```

After the `updateLeadCells` call and before the success response, add:
```ts
// Fire CAPI Lead event (non-blocking)
sendCAPIEvent({
  eventName: "Lead",
  phone: lead.phone,
  email: lead.email,
}).catch((err) => console.error("CAPI Lead event failed:", err));
```

- [ ] **Step 2: Commit**

```bash
git add app/api/messages/send/route.ts
git commit -m "feat: fire CAPI Lead event on WhatsApp message send"
```

---

## Chunk 5: Smart Triggers & Settings

### Task 25: Trigger Engine

**Files:**
- Create: `config/triggers.json`
- Create: `lib/triggers.ts`

- [ ] **Step 1: Create triggers config**

Create `config/triggers.json`:

```json
{
  "triggers": [
    {
      "id": "welcome",
      "name": "ברוכים הבאים",
      "enabled": true,
      "when": "new_lead",
      "delay_minutes": 5,
      "template": "",
      "sender": "default",
      "capi_event": "Lead"
    }
  ]
}
```

- [ ] **Step 2: Create trigger engine**

Create `lib/triggers.ts`:

```ts
import { readFile } from "fs/promises";
import path from "path";
import { getLeads } from "./sheets";
import type { Lead } from "./sheets";

export interface Trigger {
  id: string;
  name: string;
  enabled: boolean;
  when: "new_lead";
  delay_minutes: number;
  template: string;
  sender: string;
  capi_event: string;
}

interface TriggersConfig {
  triggers: Trigger[];
}

export async function getTriggers(): Promise<Trigger[]> {
  const filePath = path.join(process.cwd(), "config", "triggers.json");
  const data = await readFile(filePath, "utf-8");
  const config: TriggersConfig = JSON.parse(data);
  return config.triggers;
}

export interface PendingTrigger {
  trigger: Trigger;
  lead: Lead;
}

/**
 * Find leads that match a trigger's conditions but haven't been processed yet.
 *
 * A new_lead trigger matches when:
 * - Lead status is "new"
 * - Lead was created more than `delay_minutes` ago
 * - Lead has no messageId (no message sent yet)
 */
export async function findPendingTriggers(): Promise<PendingTrigger[]> {
  const triggers = await getTriggers();
  const leads = await getLeads();
  const now = Date.now();
  const pending: PendingTrigger[] = [];

  for (const trigger of triggers) {
    if (!trigger.enabled || !trigger.template) continue;

    if (trigger.when === "new_lead") {
      for (const lead of leads) {
        // Skip if already messaged
        if (lead.messageId || lead.status !== "new") continue;

        // Check delay
        const createdAt = lead.createdAt ? new Date(lead.createdAt).getTime() : 0;
        if (createdAt === 0) continue;

        const minutesSinceCreation = (now - createdAt) / (1000 * 60);
        if (minutesSinceCreation >= trigger.delay_minutes) {
          pending.push({ trigger, lead });
        }
      }
    }
  }

  return pending;
}
```

- [ ] **Step 3: Commit**

```bash
git add config/triggers.json lib/triggers.ts
git commit -m "feat: add trigger engine with new_lead detection"
```

---

### Task 26: Cron Route for Trigger Execution

**Files:**
- Create: `app/api/cron/triggers/route.ts`
- Modify: `next.config.js` (add cron config for Vercel)

- [ ] **Step 1: Create cron trigger route**

Create `app/api/cron/triggers/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { findPendingTriggers } from "@/lib/triggers";
import { sendTemplateMessage } from "@/lib/infobip";
import { updateLeadCells } from "@/lib/sheets";
import { sendCAPIEvent } from "@/lib/capi";
import { isFeatureEnabled } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this header)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isFeatureEnabled("triggers")) {
    return NextResponse.json({ message: "Triggers disabled" });
  }

  try {
    const pending = await findPendingTriggers();

    const results = [];

    for (const { trigger, lead } of pending) {
      try {
        // Load mappings for the template
        const mappingsRes = await fetch(
          new URL("/api/templates/mappings", request.url)
        );
        const mappingsData = await mappingsRes.json();
        const mapping = mappingsData.mappings[trigger.template];

        if (!mapping) {
          results.push({
            leadRow: lead.row,
            error: `No mapping for template: ${trigger.template}`,
          });
          continue;
        }

        // Build placeholders
        const placeholders: string[] = [];
        const sortedKeys = Object.keys(mapping.placeholders).sort(
          (a, b) => Number(a) - Number(b)
        );
        for (const key of sortedKeys) {
          const columnKey = mapping.placeholders[key];
          const value = lead[columnKey as keyof typeof lead] || "";
          placeholders.push(String(value));
        }

        // Send message
        const sendResult = await sendTemplateMessage({
          to: lead.phone,
          templateName: trigger.template,
          language: mapping.language || "he",
          placeholders,
          sender: trigger.sender === "default" ? undefined : trigger.sender,
        });

        // Update Sheet
        await updateLeadCells(lead.row, {
          status: "sent",
          messageId: sendResult.messageId,
          lastMessage: trigger.template,
          lastMessageDate: new Date().toISOString(),
        });

        // Fire CAPI event if configured
        if (trigger.capi_event) {
          await sendCAPIEvent({
            eventName: trigger.capi_event,
            phone: lead.phone,
            email: lead.email,
          });
        }

        results.push({
          leadRow: lead.row,
          triggerId: trigger.id,
          messageId: sendResult.messageId,
          success: true,
        });
      } catch (err) {
        results.push({
          leadRow: lead.row,
          triggerId: trigger.id,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error("Cron trigger error:", error);
    return NextResponse.json(
      { error: "Trigger processing failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Create vercel.json for cron config**

Create `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/triggers",
      "schedule": "* * * * *"
    }
  ]
}
```

- [ ] **Step 3: Add CRON_SECRET to .env.example**

Add to `.env.example`:
```
CRON_SECRET=                    # Vercel cron secret for trigger endpoint
```

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/triggers/route.ts vercel.json .env.example
git commit -m "feat: add cron route for smart trigger execution"
```

---

### Task 27: TriggerEditor Component

**Files:**
- Create: `components/TriggerEditor.tsx`

- [ ] **Step 1: Create TriggerEditor**

Create `components/TriggerEditor.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { t } from "@/lib/i18n";
import type { Trigger } from "@/lib/triggers";

export default function TriggerEditor() {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/triggers")
      .then((r) => r.json())
      .then((data) => {
        setTriggers(data.triggers || []);
        setLoading(false);
      });
  }, []);

  async function toggleTrigger(id: string) {
    const updated = triggers.map((t) =>
      t.id === id ? { ...t, enabled: !t.enabled } : t
    );
    setTriggers(updated);
    await fetch("/api/triggers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ triggers: updated }),
    });
  }

  if (loading) return <p className="text-gray-400">{t("common.loading")}</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-brand-navy">
        Smart Triggers
      </h2>

      {triggers.length === 0 && (
        <p className="text-gray-400">No triggers configured.</p>
      )}

      {triggers.map((trigger) => (
        <div
          key={trigger.id}
          className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium text-gray-900">{trigger.name}</span>
              <p className="text-sm text-gray-500 mt-0.5">
                When: {trigger.when} | Delay: {trigger.delay_minutes}min |
                Template: {trigger.template || "Not set"}
              </p>
            </div>
            <button
              onClick={() => toggleTrigger(trigger.id)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                trigger.enabled ? "bg-green-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  trigger.enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create triggers API route for read/write**

Create `app/api/triggers/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const TRIGGERS_PATH = path.join(process.cwd(), "config", "triggers.json");

export async function GET() {
  try {
    const data = await readFile(TRIGGERS_PATH, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json({ triggers: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    await writeFile(TRIGGERS_PATH, JSON.stringify(body, null, 2), "utf-8");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save triggers:", error);
    return NextResponse.json(
      { error: "Failed to save triggers" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add components/TriggerEditor.tsx app/api/triggers/route.ts
git commit -m "feat: add TriggerEditor component with toggle and triggers API"
```

---

### Task 28: Settings Page

**Files:**
- Create: `components/SettingsPanel.tsx`
- Create: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Create SettingsPanel component**

Create `components/SettingsPanel.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { t } from "@/lib/i18n";
import { clientConfig } from "@/client.config";
import TriggerEditor from "./TriggerEditor";
import { isFeatureEnabled } from "@/lib/config";

interface IntegrationStatus {
  name: string;
  connected: boolean;
  details?: string;
}

export default function SettingsPanel() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);

  useEffect(() => {
    // Check integration status by calling health endpoints
    checkIntegrations();
  }, []);

  async function checkIntegrations() {
    const checks: IntegrationStatus[] = [];

    // Google Sheets
    try {
      const res = await fetch("/api/leads");
      checks.push({
        name: "Google Sheets",
        connected: res.ok,
        details: res.ok ? "Connected" : "Error",
      });
    } catch {
      checks.push({ name: "Google Sheets", connected: false, details: "Unreachable" });
    }

    // Infobip
    if (clientConfig.integrations.infobip.enabled) {
      try {
        const res = await fetch("/api/templates/sync");
        checks.push({
          name: "Infobip WhatsApp",
          connected: res.ok,
          details: res.ok ? "Connected" : "Error",
        });
      } catch {
        checks.push({ name: "Infobip WhatsApp", connected: false, details: "Unreachable" });
      }
    }

    // CAPI
    if (clientConfig.integrations.capi.enabled) {
      checks.push({
        name: "Facebook CAPI",
        connected: !!process.env.NEXT_PUBLIC_FB_PIXEL_ID,
        details: "Config-based check",
      });
    }

    setIntegrations(checks);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-brand-navy">{t("settings.title")}</h1>

      {/* Integration Status */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-brand-navy">
          {t("settings.integrations")}
        </h2>
        <div className="grid gap-3">
          {integrations.map((integration) => (
            <div
              key={integration.name}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between"
            >
              <span className="font-medium text-gray-900">
                {integration.name}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {integration.details}
                </span>
                <span
                  className={`h-3 w-3 rounded-full ${
                    integration.connected ? "bg-green-500" : "bg-red-500"
                  }`}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Client Info */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-brand-navy">Client Config</h2>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">Name</dt>
              <dd className="font-medium">{clientConfig.name}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Locale</dt>
              <dd className="font-medium">{clientConfig.locale} ({clientConfig.dir})</dd>
            </div>
            <div>
              <dt className="text-gray-500">Statuses</dt>
              <dd className="font-medium">
                {clientConfig.statuses.map((s) => s.label).join(", ")}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Features</dt>
              <dd className="font-medium">
                {Object.entries(clientConfig.features)
                  .filter(([, v]) => v)
                  .map(([k]) => k)
                  .join(", ")}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Triggers */}
      {isFeatureEnabled("triggers") && (
        <section>
          <TriggerEditor />
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create settings page**

Create `app/(dashboard)/settings/page.tsx`:

```tsx
import SettingsPanel from "@/components/SettingsPanel";

export default function SettingsPage() {
  return <SettingsPanel />;
}
```

- [ ] **Step 3: Verify settings page**

```bash
npm run dev
```

Visit http://localhost:3000/settings. Expected: Integration status cards, client config display, trigger editor (if enabled).

- [ ] **Step 4: Commit**

```bash
git add components/SettingsPanel.tsx app/\(dashboard\)/settings/page.tsx
git commit -m "feat: add Settings page with integration status and trigger editor"
```

---

### Task 29: Polish & Final Touches

**Files:**
- Modify: various components for loading states and error handling
- Create: `public/logo.png` placeholder

- [ ] **Step 1: Add a placeholder logo**

Create a simple placeholder. The real logo will be replaced per client.

```bash
# Create a simple 1x1 transparent PNG as placeholder
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > public/logo.png
```

- [ ] **Step 2: Add .gitignore entries**

Ensure `.gitignore` includes:
```
.env.local
.env*.local
node_modules/
.next/
.vercel/
```

- [ ] **Step 3: Verify full flow**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

```bash
npm run dev
```

Manual verification checklist:
1. `/login` → password gate works
2. `/` → dashboard loads (error state is OK without Sheet credentials)
3. `/templates` → template manager renders
4. `/settings` → settings page renders with integration statuses
5. RTL direction is correct on all pages
6. Brand colors apply correctly
7. Nav links work and highlight active page
8. Logout works

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: polish — placeholder logo, gitignore, build verification"
```

---

## Summary

| Chunk | Tasks | What it delivers |
|-------|-------|-----------------|
| 1 | Tasks 1-5 | Working Next.js app with auth, config, i18n |
| 2 | Tasks 6-12 | Dashboard reading leads from Google Sheets |
| 3 | Tasks 13-19 | Template manager + WhatsApp message sending |
| 4 | Tasks 20-24 | Webhooks, CAPI events, one-click qualify |
| 5 | Tasks 25-29 | Smart triggers, settings, polish |

Each chunk produces a deployable, testable increment.
