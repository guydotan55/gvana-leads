import { classifyLead } from "@/lib/lead-type";

const mk = (over: any) => ({ formName: "", sheetTab: "", adsetId: "", ...over }) as any;

describe("classifyLead reorder", () => {
  it("a non-legacy tab with a keyword name still shows its own (tab) name", () => {
    const info = classifyLead(mk({ sheetTab: "מדריכים למכינה הטכנולוגית", formName: "מדריכים למכינה הטכנולוגית" }));
    expect(info.kind).toBe("custom");
    expect(info.label).toBe("מדריכים למכינה הטכנולוגית");
  });
  it("the backfilled tab label is the tab name, not the row form_name", () => {
    const info = classifyLead(mk({ sheetTab: "קמפיין משתמטים", formName: "תוכנית משתמטים" }));
    expect(info.label).toBe("קמפיין משתמטים");
  });
  it("legacy לידים tab still uses keyword classification", () => {
    const info = classifyLead(mk({ sheetTab: "לידים", formName: "מסע משתחררים" }));
    expect(info.kind).toBe("masa");
  });
});
