import { parseFormLabelsRows, findTabByFormId } from "@/lib/form-labels";

const ROWS = [
  ["formId", "sheetTab", "label", "sourceName", "updatedAt"],
  ["859292457130080", "קמפיין משתמטים", "קמפיין משתמטים", "תוכנית משתמטים", "2026-06-17"],
];

describe("form-labels parsing", () => {
  it("parses rows skipping the header", () => {
    const maps = parseFormLabelsRows(ROWS);
    expect(maps).toHaveLength(1);
    expect(maps[0].formId).toBe("859292457130080");
    expect(maps[0].sheetTab).toBe("קמפיין משתמטים");
  });
  it("finds a tab by form id, null when unseen", () => {
    const maps = parseFormLabelsRows(ROWS);
    expect(findTabByFormId(maps, "859292457130080")).toBe("קמפיין משתמטים");
    expect(findTabByFormId(maps, "nope")).toBeNull();
  });
});
