import { shouldSendAlert } from "@/lib/alerts";

describe("alert dedup", () => {
  const now = Date.parse("2026-06-18T12:00:00Z");
  const window = 60 * 60 * 1000; // 1h
  it("suppresses a same-key alert sent within the window", () => {
    const recent = [{ key: "missing-tab:X", ts: "2026-06-18T11:30:00Z" }];
    expect(shouldSendAlert(recent, "missing-tab:X", now, window)).toBe(false);
  });
  it("allows when outside the window or a different key", () => {
    const recent = [{ key: "missing-tab:X", ts: "2026-06-18T10:00:00Z" }];
    expect(shouldSendAlert(recent, "missing-tab:X", now, window)).toBe(true);
    expect(shouldSendAlert(recent, "other:Y", now, window)).toBe(true);
  });
});
