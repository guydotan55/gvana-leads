import { buildColumnMap } from "@/lib/sheets";
import columnsConfig from "@/config/columns.json";

// Header layout used by the organic tab (app/api/organic-lead) and every
// builder-created form tab (lib/forms-repo). It intentionally stops at the
// handledBy column (Y) and omits the "הערה פנימית" comment header (Z).
const HEADER_TAB_WITHOUT_COMMENT = [
  "id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name",
  "campaign_id", "campaign_name", "form_id", "form_name", "is_organic",
  "platform", "interest", "full_name", "phone_number", "lead_status",
  "", // Q gap
  "סטטוס", "הודעה אחרונה", "תאריך הודעה", "מזהה הודעה", "הערות",
  "ניסיונות", "תוכנית", "טופל ע\"י",
];

describe("buildColumnMap", () => {
  it("maps the comment column to its fixed index even when the header is missing", () => {
    const map = buildColumnMap(HEADER_TAB_WITHOUT_COMMENT);
    // Comment header absent from the row → must fall back to fixed Z (index 25),
    // the same column writes target, so saved comments read back correctly.
    expect(map.comment).toBe(columnsConfig.dashboardColumns.comment.index);
    expect(map.comment).toBe(25);
  });

  it("still detects headers that are present (no regression for status/notes)", () => {
    const map = buildColumnMap(HEADER_TAB_WITHOUT_COMMENT);
    expect(map.status).toBe(17); // R
    expect(map.notes).toBe(21); // V
    expect(map.leadId).toBe(0); // A
  });
});
