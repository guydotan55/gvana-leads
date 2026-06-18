import { isFeatureEnabled } from "@/lib/config";

describe("features.alerts", () => {
  it("is enabled for the gavna config", () => {
    expect(isFeatureEnabled("alerts")).toBe(true);
  });
});
