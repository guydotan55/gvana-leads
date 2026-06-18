import { normalizeLeadId, rowsContainLeadId } from "@/lib/sheets";

describe("dedup id matching", () => {
  it("strips the l: prefix on both sides", () => {
    expect(normalizeLeadId("l:123")).toBe("123");
    expect(normalizeLeadId("123")).toBe("123");
  });
  it("matches a lead id regardless of prefix in the sheet", () => {
    const rows = [["l:123", "..."], ["456", "..."]];
    expect(rowsContainLeadId(rows, "123")).toBe(true);
    expect(rowsContainLeadId(rows, "456")).toBe(true);
    expect(rowsContainLeadId(rows, "789")).toBe(false);
  });
});
