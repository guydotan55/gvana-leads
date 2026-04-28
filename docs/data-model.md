# Data model — Google Sheet as the database

**Spreadsheet ID** (set via `GOOGLE_SHEET_ID` env var):
`1ui273i3ILl_Z77AYiw0gCIGhzLJ-WHjItqIpkPpjTiM`

**Service account**: `GOOGLE_SERVICE_ACCOUNT_EMAIL` — must have **Editor** access on the spreadsheet (not just viewer — the app appends rows, deletes rows, and creates tabs).

---

## Philosophy

The dashboard treats the Google Sheet as a single multi-tab "database":

- Each **tab is a table**.
- Tabs whose names start with `_` are **internal/system** tabs and are ignored by the dashboard's leads view (`lib/sheets.ts:208`). Use the `_` prefix for anything that isn't lead data.
- The dashboard **discovers tabs dynamically**. When you create a builder-form, the tab appears in the leads view automatically — no code change.
- Every "lead" tab follows one of two header layouts:
  1. **Header-less legacy** (only `לידים` — uses the fixed column map in `config/columns.json`)
  2. **Self-describing** (every other lead tab — first row is column headers, parsed via `HEADER_ALIASES` in `lib/sheets.ts:40`)

```
┌────────── Browser ──────────┐
│   /form/tech, /form/[slug]  │
│   (public visitor)          │
└───────────┬─────────────────┘
            │ POST submission
            ▼
┌────────── Vercel ───────────┐
│ /api/organic-lead           │ ──► writes to: אורגני
│ /api/forms/[id]/submit      │ ──► writes to: <form's per-tab>
│ /api/form-views/[slug]      │ ──► writes to: _form_views
│ Facebook Lead Ads webhook   │ ──► writes to: לידים   (via /api/webhooks/facebook)
└───────────┬─────────────────┘
            │ read by /api/leads, /api/form-stats
            ▼
┌────────── Dashboard ────────┐
│  לוח בקרה  /  טפסים          │
└─────────────────────────────┘
```

---

## Tab inventory

The app uses **5 tab roles**. Two of them are "many" (one tab per builder form, one tab created for the meta of those forms).

| # | Tab name | Role | Header style | Written by | Read by |
|---|---|---|---|---|---|
| 1 | `לידים` | FB-imported leads | Header-less, fixed column map | `/api/webhooks/facebook` (Meta Lead Ads webhook) | `/api/leads` (dashboard) |
| 2 | `אורגני` | Submissions from the 4 hardcoded forms | Self-describing headers | `/api/organic-lead` | `/api/leads`, `/api/form-stats` |
| 3 | `_forms_meta` | Builder-form definitions | Self-describing headers | `lib/forms-repo.ts` (`/api/forms` POST/PUT/DELETE) | `/forms`, `/form/[slug]` |
| 4 | `_form_views` | Form page-view events | Self-describing headers | `/api/form-views/[slug]` | `/api/form-stats` |
| 5 | *one tab per builder form* | Submissions for that form | Self-describing headers | `/api/forms/[id]/submit` | `/api/leads` (auto-discovered) |

### 1. `לידים` — Facebook lead-ads inbox

- **Source**: Meta Lead Ads webhooks. Anything submitted via the native Facebook Lead Form lands here.
- **No header row**. Column positions are fixed by `config/columns.json`. **Do not insert/reorder columns** — `lib/sheets.ts buildFixedColumnMap()` reads by index.
- **Layout** (columns A–Z; left side is FB-supplied, right side is dashboard editorial state):

  | Col | Field | Source |
  |---|---|---|
  | A | `id` (lead id, prefixed `l:`) | FB |
  | B | `created_time` | FB |
  | C–H | `ad_id`, `ad_name`, `adset_id`, `adset_name`, `campaign_id`, `campaign_name` | FB |
  | I–J | `form_id`, `form_name` | FB |
  | K | `is_organic` | FB |
  | L | `platform` (`fb` / `ig`) | FB |
  | M | `interest` | FB |
  | N | `full_name` | FB |
  | O | `phone_number` (prefixed `p:`) | FB |
  | P | `lead_status` | FB |
  | Q | *gap* | — |
  | R | `סטטוס` | dashboard PATCH |
  | S | `הודעה אחרונה` | dashboard / sender bot |
  | T | `תאריך הודעה` | dashboard / sender bot |
  | U | `מזהה הודעה` | dashboard / sender bot |
  | V | `הערות` | dashboard PATCH |
  | W | `ניסיונות` | dashboard PATCH |
  | X | `תוכנית` | dashboard PATCH |
  | Y | `טופל ע"י` | dashboard PATCH |
  | Z | `הערה פנימית` | dashboard PATCH |

### 2. `אורגני` — Hardcoded form submissions

- **Source**: `/api/organic-lead` — the 4 hardcoded forms (`/form/tech`, `/form/masa`, `/form/student`, `/form/instructor`).
- **Self-describing**: row 1 is a header row. Same column layout as `לידים` — id in A, FB-style columns C–P, dashboard columns R–Z. The "FB" columns are filled with what the form knows: `form_name`, `campaign_name` (from UTM), `platform` (derived from UTM), full name, phone. Other FB columns stay empty.
- **`form_name`** (col J) tells you which form: `"תוכנית טכנולוגית"`, `"מסע משתחררים"`, `"טופס מדריכים"`, or `"חניכים כללי"`. **This is the routing key the dashboard uses to color-code leads** (`lib/lead-type.ts`).
- **`platform`** (col L): `"facebook"` / `"instagram"` if the lead came from a paid UTM, `"organic"` otherwise.
- **`notes`** (col V): all per-form custom answers (age, military status, interests, etc.) get serialized as `"label: value"` lines, one per line. Expand the row in the dashboard to see them.

### 3. `_forms_meta` — Builder-form definitions

- **Internal/system tab.** Not displayed in the dashboard.
- **One row per builder-created form.** Created automatically when the first form is published.
- **Layout**:

  | Col | Field | Notes |
  |---|---|---|
  | A | `id` | URL slug — what `/form/[slug]` matches against |
  | B | `title` | Hebrew title shown to visitor |
  | C | `subtitle` | optional |
  | D | `status` | `draft` or `published` |
  | E | `createdAt` | ISO timestamp |
  | F | `updatedAt` | ISO timestamp |
  | G | `sheetTab` | name of the per-form submission tab |
  | H | `fieldsJson` | JSON-encoded array of `FormField` (the wizard's questions) |

- **Source of truth for the slug.** When a visitor hits `/form/abc`, the page reads col A here.

### 4. `_form_views` — Page-view tracking

- **Internal/system tab.** Created automatically the first time anyone lands on a form page after the analytics feature shipped.
- **One row per page-load** (not unique visitors). Best-effort — if the API call fails, the form still loads.
- **Layout**:

  | Col | Field |
  |---|---|
  | A | `slug` (form id — matches `_forms_meta.id` or one of `tech`/`masa`/`student`/`instructor`) |
  | B | `timestamp` (ISO) |
  | C | `source` (`hardcoded` / `builder`) |
  | D | `utm_source` |
  | E | `utm_medium` |
  | F | `utm_campaign` |
  | G | `referer` |

- This tab grows ~1 row per visit. At ~100 visits/day across all forms it adds ~36k rows/year — fine for now, plan to archive/aggregate at >250k.

### 5. One tab per builder form (e.g. `טסט`)

- **Created automatically** the first time a user-built form is published.
- **Tab name** = the form's title (slugified for uniqueness if it collides).
- **Same column layout as `אורגני`** (a copy of the FB+dashboard 26-column schema). This is what makes builder-form leads appear in the dashboard's leads view automatically — `getLeads()` reads ALL non-`_` tabs the same way.
- **`form_name`** (col J) = the form's title. The dashboard's `lib/lead-type.ts:50` uses the *sheet tab name* as the kind="custom" bucket and shows the form title in a purple pill.

---

## Lead lifecycle

A lead's life inside the sheet:

1. **Created** in one of `לידים` / `אורגני` / a builder-form tab. Status starts as `new`.
2. **Read** on every dashboard load via `/api/leads`. The sheet is the source of truth — there's no caching layer.
3. **Edited** via `/api/leads/[row]` PATCH (status, attempts, plan, handledBy, comment). Updates a single cell at a time using the fixed dashboard column map.
4. **Deleted** via `/api/leads/[row]` DELETE — actually removes the row from the tab (hard delete; not soft).
5. **Triggered events**:
   - On submission of a paid-source form → fires Meta CAPI `Lead` event
   - On status → "relevant"/"not_relevant_target" → fires Meta CAPI `CompleteRegistration`
   - On status → "accepted" → fires Meta CAPI `Purchase`
   - These are best-effort, async, and never block the dashboard UI.

---

## Cleanup wins

### 🟥 Schema drift in builder-form tabs (priority: medium)

`lib/forms-repo.ts SUBMISSION_HEADERS` claims 25 columns ending with `Y` — but `config/columns.json` declares 26 columns ending with `Z` (`הערה פנימית`). When a new builder form is published, its submission tab will be **missing the `הערה פנימית` column**. Submissions still work (the comment field starts empty for new leads), but per-row notes from the dashboard's comment editor target a column that doesn't exist on these tabs.

**Fix**: Add `"הערה פנימית"` to the end of `SUBMISSION_HEADERS` in `lib/forms-repo.ts:30`. Then for any *existing* builder-form tab, add the `הערה פנימית` header cell in column Z manually (or run a one-shot migration).

### 🟧 Test/junk rows we created today (priority: high — clean now)

We created **two `DEBUG-DELETE` rows** while debugging the `-five.vercel.app` issue earlier today. Both should be in `אורגני`:

- `phone = 0500000099` — created during the first repro (post)
- `phone = 0500000098` — created during the second repro
- A row with name `test` and `phone = 5222222222` from earlier in the day

**Fix**: open `אורגני` → filter column N (`full_name`) by `DEBUG-DELETE` → delete the rows. Or use the dashboard's new trash-icon (per-row delete added in PR #1).

### 🟧 Orphaned columns (priority: low)

`lib/sheets.ts HEADER_ALIASES` exposes a `messageId` column (alias `מזהה הודעה`, col U). It's read into the `Lead` type and surfaced via the dashboard, but I see **no code that ever writes to it**. The matching `lastMessage`/`lastMessageDate` fields are also read but only written by code paths I can't find — likely a planned-but-never-shipped Infobip integration (`lib/infobip.ts` exists but no PATCH route writes these columns).

**Action**: Either (a) wire up the Infobip-driven message log so these columns get populated, or (b) delete the columns + their `HEADER_ALIASES` entries. Right now they're empty noise.

### 🟧 Possible orphaned tabs (priority: medium — needs your eyes)

I can only see tabs the code references. The actual sheet may contain extra tabs left over from earlier iterations or manual experiments. **You should open the sheet and check whether any of these exist that AREN'T in the inventory above:**

- A tab called `Sheet1` (auto-created by Google Sheets, sometimes left empty)
- A tab called `Form Responses` or similar (auto-created if anyone ever hooked a Google Form to the sheet)
- Any tab with a name like `Copy of …`, `_old`, `archive`, `backup`, `test`, etc.

If found and not used by code → safe to delete. If unsure, send me the tab names and I'll cross-check.

### 🟨 Duplicates check (priority: low — needs your eyes)

The app does **not** dedupe by phone or email at insert time. So if the same person submits twice (say, fills the form on mobile and again on desktop), you get two rows. Patterns to look for in `אורגני`:

- Same phone in column O appearing in 2+ rows within the same day → likely accidental double-submit
- Same phone across different `form_name` values (col J) → person filled multiple programs; usually legitimate
- Phone numbers normalized differently (`0501234567` vs `050-123-4567` vs `+972501234567`) — Google Sheets sees these as different strings.

**Quick check**: in `אורגני`, add a temporary helper column like `=COUNTIF(O:O, O2)`. Any row >1 is a duplicate of another. Decide row-by-row.

### 🟩 Healthy patterns (no action)

- `_forms_meta` and `_form_views` correctly prefixed with `_` so they stay invisible to the dashboard.
- Per-form tabs use the same 26-col layout as `אורגני` so they auto-merge into the leads view.
- Hard-delete from the dashboard goes through `Sheets.batchUpdate.deleteDimension` — no orphaned data.

---

## Verification checklist (please confirm these in the sheet)

- [ ] Tab list matches the 5 roles above. Anything extra? List them.
- [ ] `לידים` first row is **NOT** a header row (it's a real lead row). The legacy fixed column map depends on this.
- [ ] `אורגני` first row IS a header row, headers match `app/api/organic-lead/route.ts:8-21`.
- [ ] `_forms_meta` exists IF you've created at least one builder form.
- [ ] `_form_views` exists IF the analytics feature has fired at least once (any visit since today's deploy).
- [ ] No `DEBUG-DELETE` rows remain after cleanup.

---

## When to migrate off Sheets

The Sheet is fine for the current scale (low thousands of rows total, single-digit admins, ~100 reads/min peak). Plan a migration when any of these hit:

- **Read latency** — the dashboard's `/api/leads` regularly takes >2s (Sheets API rate caps at 60 reads/min/user)
- **Row count** — `_form_views` exceeds 100k rows (Sheets stays usable up to ~500k but math gets slow)
- **Concurrent editors** — more than 3 admins regularly editing leads at once (Sheets locking starts to bite)

Cleanest target when the time comes: **Supabase** (already in our MCP). One-shot migration script reads each tab into a Postgres table; the dashboard's existing `lib/sheets.ts` interface can be re-implemented against Postgres without touching the UI.
