import { isDue, parseOutboxRows, MAX_ATTEMPTS } from "@/lib/capi-outbox";

describe("outbox pure logic", () => {
  const base = { leadgenId: "l1", sheetTab: "t", lastError: "", nextAttemptAt: "2026-06-17T00:00:00Z" };
  it("pending + due time + under max → due", () => {
    expect(isDue({ ...base, status: "pending", attempts: 1 }, "2026-06-18T00:00:00Z")).toBe(true);
  });
  it("done or maxed or future → not due", () => {
    expect(isDue({ ...base, status: "done", attempts: 1 }, "2026-06-18T00:00:00Z")).toBe(false);
    expect(isDue({ ...base, status: "pending", attempts: MAX_ATTEMPTS }, "2026-06-18T00:00:00Z")).toBe(false);
    expect(isDue({ ...base, status: "pending", attempts: 1, nextAttemptAt: "2026-06-30T00:00:00Z" }, "2026-06-18T00:00:00Z")).toBe(false);
  });
  it("parses rows skipping header", () => {
    const rows = [["leadgenId","sheetTab","status","attempts","lastError","nextAttemptAt"],
                  ["l1","t","pending","2","err","2026-06-17T00:00:00Z"]];
    const out = parseOutboxRows(rows);
    expect(out[0]).toMatchObject({ leadgenId: "l1", status: "pending", attempts: 2 });
  });
});
