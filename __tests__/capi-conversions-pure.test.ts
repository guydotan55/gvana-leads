import { resolveConversion, parseConvRows, isDue, keyOf, MAX_ATTEMPTS } from "@/lib/capi-conversions";

const events = { lead: "Lead", qualified: "CompleteRegistration", accepted: "Purchase" };

describe("resolveConversion", () => {
  const lead = { leadId: "lg1", campaignName: "Camp A" };

  it("relevant → qualified event with campaign_name", () => {
    expect(resolveConversion("relevant", lead, events, 1700000000)).toEqual({
      eventName: "CompleteRegistration",
      eventTime: 1700000000,
      customData: { content_name: "lead_relevant", campaign_name: "Camp A" },
    });
  });
  it("not_relevant_target → same qualified event (same stage)", () => {
    const r = resolveConversion("not_relevant_target", lead, events, 1700000000);
    expect(r?.eventName).toBe("CompleteRegistration");
    expect(r?.customData.content_name).toBe("lead_not_relevant_target");
  });
  it("accepted → accepted event", () => {
    const r = resolveConversion("accepted", lead, events, 1700000000);
    expect(r?.eventName).toBe("Purchase");
    expect(r?.customData.content_name).toBe("lead_accepted");
  });
  it("under_review → null (no event)", () => {
    expect(resolveConversion("under_review", lead, events, 1)).toBeNull();
  });
  it("not_relevant → null (wrong audience)", () => {
    expect(resolveConversion("not_relevant", lead, events, 1)).toBeNull();
  });
  it("empty leadId → null (organic/manual lead, unattributable)", () => {
    expect(resolveConversion("relevant", { leadId: "", campaignName: "X" }, events, 1)).toBeNull();
  });
  it("omits campaign_name when the lead has none", () => {
    const r = resolveConversion("relevant", { leadId: "lg1" }, events, 1);
    expect(r?.customData).toEqual({ content_name: "lead_relevant" });
  });
});

describe("keyOf", () => {
  it("composites leadgenId + eventName and distinguishes events", () => {
    expect(keyOf("lg1", "Purchase")).toBe("lg1::Purchase");
    expect(keyOf("lg1", "Purchase")).not.toBe(keyOf("lg1", "CompleteRegistration"));
  });
});

describe("parseConvRows", () => {
  it("parses rows, skips header, round-trips eventTime + payloadJson", () => {
    const rows = [
      ["leadgenId","eventName","sheetTab","status","attempts","lastError","nextAttemptAt","eventTime","payloadJson"],
      ["lg1","CompleteRegistration","tab1","pending","2","err","2026-06-24T00:00:00Z","1700000000",'{"content_name":"lead_relevant"}'],
    ];
    const out = parseConvRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      leadgenId: "lg1", eventName: "CompleteRegistration", sheetTab: "tab1",
      status: "pending", attempts: 2, eventTime: 1700000000,
    });
    expect(JSON.parse(out[0].payloadJson)).toEqual({ content_name: "lead_relevant" });
  });
});

describe("isDue", () => {
  const base = { leadgenId: "lg1", eventName: "Purchase", sheetTab: "t", lastError: "", nextAttemptAt: "2026-06-17T00:00:00Z", eventTime: 1, payloadJson: "" };
  it("pending + due time + under max → due", () => {
    expect(isDue({ ...base, status: "pending", attempts: 1 }, "2026-06-18T00:00:00Z")).toBe(true);
  });
  it("done / maxed / future → not due", () => {
    expect(isDue({ ...base, status: "done", attempts: 1 }, "2026-06-18T00:00:00Z")).toBe(false);
    expect(isDue({ ...base, status: "pending", attempts: MAX_ATTEMPTS }, "2026-06-18T00:00:00Z")).toBe(false);
    expect(isDue({ ...base, status: "pending", attempts: 1, nextAttemptAt: "2026-06-30T00:00:00Z" }, "2026-06-18T00:00:00Z")).toBe(false);
  });
});
