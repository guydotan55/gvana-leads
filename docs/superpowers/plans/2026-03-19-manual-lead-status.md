# Manual Lead Status Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace WhatsApp-automation statuses with manual lead statuses (חדש, רלוונטי, לא רלוונטי, לא זמין) and an inline status dropdown in the dashboard table.

**Architecture:** Update the config, data model, and API to support 4 new statuses + an attempts counter. Replace the action buttons with an inline `<select>` dropdown. Optimistic UI updates with poll-skip logic.

**Tech Stack:** Next.js 14 (App Router), Google Sheets API, TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-19-manual-lead-status-design.md`

**Migration note:** Existing leads with old statuses ("sent", "read", "qualified") will silently become "new" after deployment, since `rowToLead` in `lib/sheets.ts` defaults unknown statuses to `"new"`. This is the desired behavior.

**Build note:** Intermediate commits between Tasks 3-5 may not build independently. This is expected — the full feature lands after Task 5.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `config/columns.json` | Modify | Add `attempts` column W |
| `client.config.ts` | Modify | Replace statuses array |
| `lib/sheets.ts` | Modify | Update `VALID_STATUSES`, `Lead` interface, sheet range |
| `lib/i18n/dictionaries/he.json` | Modify | New status/stats translations |
| `lib/i18n/dictionaries/en.json` | Modify | New status/stats translations |
| `app/api/leads/[row]/route.ts` | Create | PATCH endpoint for status updates |
| `components/StatsBar.tsx` | Modify | New props for 4 new stat types |
| `components/DashboardClient.tsx` | Modify | New status handler, updated stats, optimistic updates |
| `components/LeadTable.tsx` | Modify | Inline status dropdown, attempts counter, remove actions |
| `components/StatusBadge.tsx` | Delete | Replaced by inline select |
| `components/SendMessageDialog.tsx` | Delete | Not needed without WhatsApp |

---

### Task 1: Config & Data Model

**Files:**
- Modify: `config/columns.json`
- Modify: `client.config.ts`
- Modify: `lib/sheets.ts:1-10,103-117`
- Modify: `lib/i18n/dictionaries/he.json`
- Modify: `lib/i18n/dictionaries/en.json`

- [ ] **Step 1: Add attempts column to columns.json**

In `config/columns.json`, add to `dashboardColumns`:

```json
"attempts": { "index": 22, "letter": "W", "header": "ניסיונות" }
```

- [ ] **Step 2: Replace statuses in client.config.ts**

Replace the `statuses` array (lines 45-50) with:

```typescript
statuses: [
  { key: "new", label: "חדש", color: "orange" },
  { key: "relevant", label: "רלוונטי", color: "green" },
  { key: "not_relevant", label: "לא רלוונטי", color: "red" },
  { key: "unavailable", label: "לא זמין", color: "gray" },
],
```

- [ ] **Step 3: Update lib/sheets.ts**

Export `VALID_STATUSES` (line 4):

```typescript
export const VALID_STATUSES = ["new", "relevant", "not_relevant", "unavailable"];
```

Add `attempts` to the `Lead` interface (after `notes: string;` at line 30):

```typescript
attempts: number;
```

In `getLeads()`, the range `${sheetName}!A1:V` (line 107) must become `${sheetName}!A1:W`.

In the row-to-Lead mapping, add attempts parsing. Find where `notes` is mapped (should reference `dashCols.notes.index`) and add below it:

```typescript
attempts: parseInt(row[dashCols.attempts.index] || "0", 10) || 0,
```

- [ ] **Step 4: Update i18n dictionaries**

In `he.json`, replace the stats and actions keys:

```json
"stats.newToday": "לידים חדשים היום",
"stats.relevant": "רלוונטיים",
"stats.notRelevant": "לא רלוונטיים",
"stats.unavailable": "לא זמינים",
"leads.attempts": "ניסיונות",
"status.new": "חדש",
"status.relevant": "רלוונטי",
"status.not_relevant": "לא רלוונטי",
"status.unavailable": "לא זמין"
```

Remove: `"stats.messagesSent"`, `"stats.readReceipts"`, `"stats.qualified"`, `"actions.send"`, `"actions.qualify"`, `"actions.sendAndQualify"`.

In `en.json`, same changes:

```json
"stats.newToday": "New Leads Today",
"stats.relevant": "Relevant",
"stats.notRelevant": "Not Relevant",
"stats.unavailable": "Unavailable",
"leads.attempts": "Attempts",
"status.new": "New",
"status.relevant": "Relevant",
"status.not_relevant": "Not Relevant",
"status.unavailable": "Unavailable"
```

Remove the same keys as Hebrew.

- [ ] **Step 5: Commit**

```bash
git add config/columns.json client.config.ts lib/sheets.ts lib/i18n/dictionaries/he.json lib/i18n/dictionaries/en.json
git commit -m "feat: update data model for manual lead statuses"
```

---

### Task 2: Status Update API

**Files:**
- Create: `app/api/leads/[row]/route.ts`

- [ ] **Step 1: Create the PATCH endpoint**

Create `app/api/leads/[row]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getLeads, updateLeadCells, VALID_STATUSES } from "@/lib/sheets";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ row: string }> }
) {
  try {
    const { row } = await params;
    const rowNum = parseInt(row, 10);
    if (!rowNum || rowNum < 2) {
      return NextResponse.json({ error: "Invalid row" }, { status: 400 });
    }

    const { status, attempts } = await request.json();

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify lead exists
    const leads = await getLeads();
    const lead = leads.find((l) => l.row === rowNum);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const updates: Record<string, string> = { status };

    if (status === "unavailable" && typeof attempts === "number" && attempts >= 0) {
      updates.attempts = String(attempts);
    }

    await updateLeadCells(rowNum, updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Status update failed:", error);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 }
    );
  }
}
```

Note: In Next.js 15 App Router, dynamic route params are accessed as a Promise. Check `lib/sheets.ts` `updateLeadCells` to confirm it accepts string values for `attempts` — it should, since `updateLeadCell` writes to the sheet with `USER_ENTERED`.

- [ ] **Step 2: Verify updateLeadCells supports the `attempts` key**

`updateLeadCells` iterates over the keys of the updates object and calls `updateLeadCell` for each. It looks up the column letter from `dashboardColumns` in `columns.json`. Since we added `attempts` to `dashboardColumns` in Task 1, this should work. Verify by reading `lib/sheets.ts` lines 138-146.

- [ ] **Step 3: Commit**

```bash
git add app/api/leads/\[row\]/route.ts
git commit -m "feat: add PATCH /api/leads/[row] for status updates"
```

---

### Task 3: StatsBar Update

**Files:**
- Modify: `components/StatsBar.tsx`

- [ ] **Step 1: Update StatsBar props and rendering**

Replace the entire `StatsBar.tsx` content:

```typescript
import { t } from "@/lib/i18n";

interface StatsBarProps {
  newToday: number;
  relevant: number;
  notRelevant: number;
  unavailable: number;
}

export default function StatsBar({ newToday, relevant, notRelevant, unavailable }: StatsBarProps) {
  const stats = [
    { label: t("stats.newToday"), value: newToday, color: "text-brand-orange" },
    { label: t("stats.relevant"), value: relevant, color: "text-green-600" },
    { label: t("stats.notRelevant"), value: notRelevant, color: "text-red-500" },
    { label: t("stats.unavailable"), value: unavailable, color: "text-gray-500" },
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
git commit -m "feat: update StatsBar for new lead statuses"
```

---

### Task 4: DashboardClient Update

**Files:**
- Modify: `components/DashboardClient.tsx`

- [ ] **Step 1: Rewrite DashboardClient**

Replace the entire `DashboardClient.tsx` content:

```typescript
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import StatsBar from "./StatsBar";
import LeadTable from "./LeadTable";
import { t } from "@/lib/i18n";
import type { Lead } from "@/lib/sheets";

const POLL_INTERVAL = 30_000;

export default function DashboardClient() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formFilter, setFormFilter] = useState("");
  const [updateError, setUpdateError] = useState("");
  const skipNextPoll = useRef(false);

  const fetchLeads = useCallback(async () => {
    if (skipNextPoll.current) {
      skipNextPoll.current = false;
      return;
    }
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

  async function handleStatusChange(lead: Lead, newStatus: string, attempts?: number) {
    const prevLeads = leads;
    // Optimistic update
    setLeads((prev) =>
      prev.map((l) =>
        l.row === lead.row
          ? { ...l, status: newStatus, attempts: attempts ?? l.attempts }
          : l
      )
    );
    skipNextPoll.current = true;

    try {
      const body: Record<string, unknown> = { status: newStatus };
      if (newStatus === "unavailable" && typeof attempts === "number") {
        body.attempts = attempts;
      }
      const res = await fetch(`/api/leads/${lead.row}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Update failed");
    } catch {
      // Revert on failure and show brief error
      setLeads(prevLeads);
      skipNextPoll.current = false;
      setUpdateError(t("common.error"));
      setTimeout(() => setUpdateError(""), 3000);
    }
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  const newToday = leads.filter(
    (l) => l.status === "new" && l.createdTime?.startsWith(todayISO)
  ).length;
  const relevant = leads.filter((l) => l.status === "relevant").length;
  const notRelevant = leads.filter((l) => l.status === "not_relevant").length;
  const unavailable = leads.filter((l) => l.status === "unavailable").length;

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
      {updateError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {updateError}
        </div>
      )}
      <StatsBar
        newToday={newToday}
        relevant={relevant}
        notRelevant={notRelevant}
        unavailable={unavailable}
      />
      <LeadTable
        leads={formFilter ? leads.filter((l) => l.formName === formFilter) : leads}
        allLeads={leads}
        formFilter={formFilter}
        onFormFilterChange={setFormFilter}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/DashboardClient.tsx
git commit -m "feat: update DashboardClient with manual status handling"
```

---

### Task 5: LeadTable with Status Dropdown

**Files:**
- Modify: `components/LeadTable.tsx`

- [ ] **Step 1: Rewrite LeadTable**

Replace the entire `LeadTable.tsx` content:

```typescript
"use client";

import { useMemo } from "react";
import { t } from "@/lib/i18n";
import { clientConfig } from "@/client.config";
import type { Lead } from "@/lib/sheets";

interface LeadTableProps {
  leads: Lead[];
  allLeads: Lead[];
  formFilter: string;
  onFormFilterChange: (form: string) => void;
  onStatusChange: (lead: Lead, status: string, attempts?: number) => void;
}

const statusColorClasses: Record<string, string> = {
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  green: "bg-green-100 text-green-700 border-green-200",
  red: "bg-red-100 text-red-700 border-red-200",
  gray: "bg-gray-100 text-gray-700 border-gray-200",
};

function getStatusColor(statusKey: string): string {
  const status = clientConfig.statuses.find((s) => s.key === statusKey);
  return statusColorClasses[status?.color || "gray"] || statusColorClasses.gray;
}

function SourceBadge({ source }: { source: string }) {
  const isFacebook =
    source?.toLowerCase().includes("facebook") ||
    source?.toLowerCase().includes("fb");
  const isInstagram =
    source?.toLowerCase().includes("instagram") ||
    source?.toLowerCase().includes("ig");

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

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    const date = new Date(iso);
    return date.toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function StatusSelect({
  lead,
  onStatusChange,
}: {
  lead: Lead;
  onStatusChange: (lead: Lead, status: string, attempts?: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <select
        value={lead.status}
        onChange={(e) => onStatusChange(lead, e.target.value)}
        className={`px-2 py-1 rounded-full text-xs font-medium border cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-sky/30 ${getStatusColor(lead.status)}`}
      >
        {clientConfig.statuses.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      {lead.status === "unavailable" && (
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span>{t("leads.attempts")}: {lead.attempts}</span>
          <button
            onClick={() =>
              onStatusChange(lead, "unavailable", lead.attempts + 1)
            }
            className="w-5 h-5 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 text-gray-600 font-bold text-xs"
            title="+1"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

export default function LeadTable({
  leads,
  allLeads,
  formFilter,
  onFormFilterChange,
  onStatusChange,
}: LeadTableProps) {
  const formNames = useMemo(() => {
    const names = new Set<string>();
    allLeads.forEach((l) => {
      if (l.formName?.trim()) names.add(l.formName);
    });
    return Array.from(names).sort();
  }, [allLeads]);

  return (
    <div>
      {/* Form filter */}
      {formNames.length > 0 && (
        <div className="mb-4">
          <select
            value={formFilter}
            onChange={(e) => onFormFilterChange(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-sky/30 focus:border-brand-sky"
          >
            <option value="">{t("leads.filter.allForms")}</option>
            {formNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Table */}
      {leads.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <p className="text-gray-400">{t("leads.table.empty")}</p>
        </div>
      ) : (
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
                    {t("leads.table.date")}
                  </th>
                  <th className="text-start px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    {t("leads.table.source")}
                  </th>
                  <th className="text-start px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    {t("leads.table.status")}
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
                      <span className="font-medium text-gray-900">
                        {lead.fullName}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 font-mono" dir="ltr">
                        {lead.phone}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-500 whitespace-nowrap" dir="ltr">
                        {formatDate(lead.createdTime)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <SourceBadge source={lead.platform} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusSelect
                        lead={lead}
                        onStatusChange={onStatusChange}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/LeadTable.tsx
git commit -m "feat: add inline status dropdown with attempts counter"
```

---

### Task 6: Delete Dead Code & Final Verification

**Files:**
- Delete: `components/StatusBadge.tsx`
- Delete: `components/SendMessageDialog.tsx`

- [ ] **Step 1: Delete unused components**

```bash
rm components/StatusBadge.tsx components/SendMessageDialog.tsx
```

- [ ] **Step 2: Verify no remaining imports of deleted files**

Search the codebase for any imports of `StatusBadge` or `SendMessageDialog`. There should be none after the Task 4 and Task 5 changes.

```bash
grep -r "StatusBadge\|SendMessageDialog" --include="*.tsx" --include="*.ts" components/ app/
```

Expected: no matches.

- [ ] **Step 3: Build verification**

```bash
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Manual test**

Open the dashboard in a browser. Verify:
1. Stats bar shows 4 new cards: חדשים היום, רלוונטיים, לא רלוונטיים, לא זמינים
2. Table shows columns: שם, טלפון, תאריך, מקור, סטטוס
3. Status column has a colored `<select>` dropdown
4. Changing status updates the dropdown color immediately
5. Setting status to "לא זמין" shows the attempts counter with a + button
6. Clicking + increments the counter
7. Form filter dropdown works
8. No "שלח הודעה" or "סמן כמוסמך" buttons visible

- [ ] **Step 5: Commit and done**

```bash
git add -A
git commit -m "chore: remove StatusBadge and SendMessageDialog (replaced by inline status dropdown)"
```
