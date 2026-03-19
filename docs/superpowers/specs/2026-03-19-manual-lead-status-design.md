# Manual Lead Status Management

## Problem

The dashboard currently has statuses and actions designed around WhatsApp automation (new → sent → read → qualified). The user wants to use the dashboard **before** connecting WhatsApp, manually calling/texting leads and updating their status.

## Design

### New Statuses

Replace the current 4 statuses with:

| Key | Label | Color | Description |
|-----|-------|-------|-------------|
| `new` | חדש | orange | Lead just arrived, not yet contacted |
| `relevant` | רלוונטי | green | Lead is relevant / interested |
| `not_relevant` | לא רלוונטי | red | Lead is not relevant |
| `unavailable` | לא זמין | gray | Couldn't reach the lead |

### Status Update UX

- Replace the static `StatusBadge` + action buttons with an inline `<select>` dropdown per table row
- The dropdown is styled with the current status color as background
- Selecting a new status immediately calls `PATCH /api/leads/[row]` to update the Google Sheet
- Apply the status change **optimistically** in local state. If the API call fails, revert to the previous status and show a brief error indicator
- No confirmation dialog — instant update

### Contact Attempts Counter

- When a lead's status is `unavailable`, show a small counter next to/below the status dropdown
- The counter shows how many times the user tried to reach the lead
- A `+` button increments the counter (calls the same API endpoint with updated `attempts` value)
- Counter is only visible when status is `unavailable`
- When status changes from `unavailable` to something else, the stored attempts value is kept in the sheet but hidden from the UI
- Attempts are stored in a **dedicated column W (index 22)** in the Google Sheet, header: "ניסיונות"

### Data Model Change

Add to `config/columns.json` under `dashboardColumns`:
```json
"attempts": { "index": 22, "letter": "W", "header": "ניסיונות" }
```

Add to `Lead` interface in `lib/sheets.ts`:
```typescript
attempts: number;
```

Update the sheet read range from `A1:V` to `A1:W`.

### Table Columns

Columns in order (RTL layout):

1. **שם** (name) — `fullName`
2. **טלפון** (phone) — `phone`, monospace, LTR
3. **תאריך** (date) — `createdTime`, formatted as `DD/MM/YY HH:MM` in Hebrew locale
4. **מקור** (source) — `platform`, with colored badge (Facebook blue, Instagram pink)
5. **סטטוס** (status) — inline `<select>` dropdown + attempts counter when unavailable

Removed columns: הודעה אחרונה (last message), פעולות (actions)

### Form Filter

Already exists in `LeadTable.tsx` — keep as-is:
- Dropdown above the table to filter leads by `formName`
- Default: "כל הטפסים" (all forms)
- Shows all unique form names from the data

### Stats Bar

Update the 4 stat cards:

| Card | Label | Count logic |
|------|-------|-------------|
| 1 | לידים חדשים היום | leads with status `new` AND `createdTime` is today |
| 2 | רלוונטיים | total leads with status `relevant` |
| 3 | לא רלוונטיים | total leads with status `not_relevant` |
| 4 | לא זמינים | total leads with status `unavailable` |

### API

**New endpoint: `PATCH /api/leads/[row]`**

Request body:
```json
{
  "status": "unavailable",
  "attempts": 2
}
```

- Validates `status` is one of the 4 valid values
- Validates that the lead row exists before updating
- Updates the status column (and optionally attempts column) in Google Sheets via `updateLeadCells`
- If `attempts` is provided and status is `unavailable`, stores the attempt count
- No CAPI events — CAPI is not connected yet and will be added later when WhatsApp integration is set up

### Polling Race Condition Mitigation

The dashboard polls every 30 seconds. To prevent a poll from reverting an optimistic status change:
- After a successful status PATCH, skip the next poll cycle (set a flag that clears after one poll interval)

### Removed Features

- "שלח הודעה" (Send Message) button — removed from table
- "סמן כמוסמך" (Mark as Qualified) button — removed from table
- `SendMessageDialog` — no longer imported in DashboardClient

### Files to Change

1. **`client.config.ts`** — replace statuses array with 4 new statuses
2. **`config/columns.json`** — add `attempts` column (W, index 22)
3. **`lib/sheets.ts`** — update `VALID_STATUSES`, add `attempts: number` to `Lead` interface, update sheet range to `A1:W`
4. **New `app/api/leads/[row]/route.ts`** — PATCH endpoint for status + attempts update
5. **`components/LeadTable.tsx`** — replace status badge + action buttons with `<select>` dropdown, ensure date column is present, add attempts counter for unavailable
6. **`components/DashboardClient.tsx`** — remove `handleQualify`, remove `onSendMessage`/`setSendingTo`, add `handleStatusChange` with optimistic updates and poll-skip logic, update stats calculations
7. **`components/StatsBar.tsx`** — update props: `newToday`, `relevant`, `notRelevant`, `unavailable`
8. **`lib/i18n/dictionaries/he.json`** — add: `status.new`, `status.relevant`, `status.not_relevant`, `status.unavailable`, `stats.relevant`, `stats.notRelevant`, `stats.unavailable`, `leads.attempts`. Remove: `actions.send`, `actions.qualify`, `actions.sendAndQualify`, `stats.messagesSent`, `stats.readReceipts`, `stats.qualified`
9. **`lib/i18n/dictionaries/en.json`** — same as above in English

### Files to Delete

- **`components/StatusBadge.tsx`** — replaced by inline select
- **`components/SendMessageDialog.tsx`** — not needed without WhatsApp

### What Stays

- Table structure and layout
- 30-second polling for new leads (with skip-after-update logic)
- Form filter dropdown (already exists)
- Source badges (Facebook/Instagram)
- Google Sheets as data store
- RTL layout
- `app/api/leads/qualify/route.ts` — kept for future use when WhatsApp/CAPI is connected
