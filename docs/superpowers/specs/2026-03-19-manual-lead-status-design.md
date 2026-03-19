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
- Selecting a new status immediately calls `PUT /api/leads/status` to update the Google Sheet
- No confirmation dialog — instant update

### Contact Attempts Counter

- When a lead's status is `unavailable`, show a small counter next to/below the status dropdown
- The counter shows how many times the user tried to reach the lead
- A `+` button increments the counter (calls the same status API with an `attempts` field)
- Counter is only visible when status is `unavailable`
- The attempts count is stored in a new column in the Google Sheet (reuse `notes` or add to `lastMessage` column — implementation detail)

### Table Columns

Columns in order (RTL layout):

1. **שם** (name) — `fullName`
2. **טלפון** (phone) — `phone`, monospace, LTR
3. **תאריך** (date) — `createdTime`, formatted as `DD/MM/YY HH:MM` in Hebrew locale
4. **מקור** (source) — `platform`, with colored badge (Facebook blue, Instagram pink)
5. **סטטוס** (status) — inline `<select>` dropdown + attempts counter when unavailable

Removed columns: הודעה אחרונה (last message), פעולות (actions)

### Form Filter

- Dropdown above the table to filter leads by `formName`
- Default: "כל הטפסים" (all forms)
- Shows all unique form names from the data

### Stats Bar

Update the 4 stat cards to reflect new statuses:

| Card | Label | Count logic |
|------|-------|-------------|
| 1 | חדשים | leads with status `new` |
| 2 | רלוונטיים | leads with status `relevant` |
| 3 | לא רלוונטיים | leads with status `not_relevant` |
| 4 | לא זמינים | leads with status `unavailable` |

### API

**New endpoint: `PUT /api/leads/status`**

Request body:
```json
{
  "leadRow": 5,
  "status": "unavailable",
  "attempts": 2
}
```

- Validates `status` is one of the 4 valid values
- Updates the status column in Google Sheets via `updateLeadCells`
- If `attempts` is provided and status is `unavailable`, stores the attempt count

### Removed Features

- "שלח הודעה" (Send Message) button — removed from table
- "סמן כמוסמך" (Mark as Qualified) button — removed from table
- `SendMessageDialog` — no longer imported in DashboardClient
- Qualify API call from dashboard — replaced by generic status update

### Files to Change

1. **`client.config.ts`** — replace statuses array with 4 new statuses
2. **`lib/sheets.ts`** — update `VALID_STATUSES` array, add `attempts` field to `Lead` interface
3. **New `app/api/leads/status/route.ts`** — PUT endpoint for status + attempts update
4. **`components/LeadTable.tsx`** — replace status badge + action buttons with `<select>` dropdown, add date column, add attempts counter for unavailable, keep form filter
5. **`components/DashboardClient.tsx`** — remove `handleQualify`, remove `onSendMessage`, add `handleStatusChange`, update stats calculations, remove `SendMessageDialog` import
6. **`components/StatsBar.tsx`** — update to accept new stat names
7. **`lib/i18n/dictionaries/he.json`** — add new status labels, remove old action labels
8. **`lib/i18n/dictionaries/en.json`** — same

### What Stays

- Table structure and layout
- 30-second polling for new leads
- Form filter dropdown
- Source badges (Facebook/Instagram)
- Google Sheets as data store
- RTL layout
