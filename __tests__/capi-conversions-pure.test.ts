import {
  resolveConversion,
  parseConvRows,
  isDue,
  keyOf,
  shouldArm,
  dueRows,
  crmFields,
  MAX_ATTEMPTS,
  type ConvRow,
} from "@/lib/capi-conversions";

const events = { lead: "Lead", qualified: "CompleteRegistration", accepted: "Purchase" };
const crm = { eventSource: "crm", leadEventSource: "Gavna_Leads" };

describe("resolveConversion", () => {
  const lead = { leadId: "lg1", campaignName: "Camp A" };

  it("relevant → qualified event with campaign_name + crm source fields", () => {
    expect(resolveConversion("relevant", lead, events, crm, 1700000000)).toEqual({
      eventName: "CompleteRegistration",
      eventTime: 1700000000,
      customData: {
        content_name: "lead_relevant",
        campaign_name: "Camp A",
        event_source: "crm",
        lead_event_source: "Gavna_Leads",
      },
    });
  });
  it("not_relevant_target → same qualified event (same stage)", () => {
    const r = resolveConversion("not_relevant_target", lead, events, crm, 1700000000);
    expect(r?.eventName).toBe("CompleteRegistration");
    expect(r?.customData.content_name).toBe("lead_not_relevant_target");
  });
  it("future_cohort → same qualified event (young, future cohort)", () => {
    const r = resolveConversion("future_cohort", lead, events, crm, 1700000000);
    expect(r?.eventName).toBe("CompleteRegistration");
    expect(r?.customData.content_name).toBe("lead_future_cohort");
  });
  it("accepted → accepted event", () => {
    const r = resolveConversion("accepted", lead, events, crm, 1700000000);
    expect(r?.eventName).toBe("Purchase");
    expect(r?.customData.content_name).toBe("lead_accepted");
  });
  it("under_review → null (no event)", () => {
    expect(resolveConversion("under_review", lead, events, crm, 1)).toBeNull();
  });
  it("not_relevant → null (wrong audience)", () => {
    expect(resolveConversion("not_relevant", lead, events, crm, 1)).toBeNull();
  });
  it("empty leadId → null (organic/manual lead, unattributable)", () => {
    expect(resolveConversion("relevant", { leadId: "", campaignName: "X" }, events, crm, 1)).toBeNull();
  });
  it("omits campaign_name when the lead has none", () => {
    const r = resolveConversion("relevant", { leadId: "lg1" }, events, crm, 1);
    expect(r?.customData.content_name).toBe("lead_relevant");
    expect(r?.customData).not.toHaveProperty("campaign_name");
  });
  it("omits crm source fields when config is empty", () => {
    const r = resolveConversion(
      "relevant",
      { leadId: "lg1" },
      events,
      { eventSource: "", leadEventSource: "" },
      1
    );
    expect(r?.customData).toEqual({ content_name: "lead_relevant" });
  });
});

describe("shouldArm", () => {
  const base: ConvRow = {
    leadgenId: "lg1", eventName: "Purchase", sheetTab: "t",
    status: "pending", attempts: 0, lastError: "", nextAttemptAt: "", eventTime: 1, payloadJson: "",
  };
  it("no existing row → arm", () => {
    expect(shouldArm(undefined)).toBe(true);
  });
  it("existing failed row → re-arm", () => {
    expect(shouldArm({ ...base, status: "failed" })).toBe(true);
  });
  it("existing pending or done row → do not arm (deduped no-op)", () => {
    expect(shouldArm({ ...base, status: "pending" })).toBe(false);
    expect(shouldArm({ ...base, status: "done" })).toBe(false);
  });
});

describe("crmFields", () => {
  it("returns event_source + lead_event_source when set", () => {
    expect(crmFields({ eventSource: "crm", leadEventSource: "Gavna_Leads" })).toEqual({
      event_source: "crm",
      lead_event_source: "Gavna_Leads",
    });
  });
  it("omits empty values (multi-client: a client may disable crm tagging)", () => {
    expect(crmFields({ eventSource: "", leadEventSource: "" })).toEqual({});
    expect(crmFields({ eventSource: "crm", leadEventSource: "" })).toEqual({ event_source: "crm" });
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
  const base: ConvRow = {
    leadgenId: "lg1", eventName: "Purchase", sheetTab: "t",
    status: "pending", attempts: 0, lastError: "", nextAttemptAt: "2026-06-17T00:00:00Z", eventTime: 1, payloadJson: "",
  };
  it("pending + due time + under max → due", () => {
    expect(isDue({ ...base, status: "pending", attempts: 1 }, "2026-06-18T00:00:00Z")).toBe(true);
  });
  it("done / maxed / future → not due", () => {
    expect(isDue({ ...base, status: "done", attempts: 1 }, "2026-06-18T00:00:00Z")).toBe(false);
    expect(isDue({ ...base, status: "pending", attempts: MAX_ATTEMPTS }, "2026-06-18T00:00:00Z")).toBe(false);
    expect(isDue({ ...base, status: "pending", attempts: 1, nextAttemptAt: "2026-06-30T00:00:00Z" }, "2026-06-18T00:00:00Z")).toBe(false);
  });
});

describe("dueRows (dedup-on-read)", () => {
  const now = "2026-06-25T00:00:00Z";
  const mk = (o: Partial<ConvRow>): ConvRow => ({
    leadgenId: "lg1", eventName: "CompleteRegistration", sheetTab: "t",
    status: "pending", attempts: 0, lastError: "", nextAttemptAt: "", eventTime: 1, payloadJson: "",
    ...o,
  });

  it("returns a normal due pending row", () => {
    expect(dueRows([mk({})], now)).toHaveLength(1);
  });
  it("suppresses a due pending duplicate when a done row shares the key", () => {
    const rows = [
      mk({ status: "done" }),     // conversion already completed
      mk({ status: "pending" }),  // stranded duplicate from a concurrent-append race
    ];
    expect(dueRows(rows, now)).toHaveLength(0);
  });
  it("collapses two pending duplicates of the same key (no done yet) to a single send", () => {
    const rows = [
      mk({ status: "pending" }),  // both appended by a concurrent-upsert race,
      mk({ status: "pending" }),  // neither marked done yet → must send ONCE, not twice
    ];
    expect(dueRows(rows, now)).toHaveLength(1);
  });
  it("still returns distinct keys (collapse is per-key, not global)", () => {
    const rows = [
      mk({ eventName: "CompleteRegistration", status: "pending" }),
      mk({ eventName: "Purchase", status: "pending" }),
    ];
    expect(dueRows(rows, now)).toHaveLength(2);
  });
  it("does not suppress a due row whose key has no done row", () => {
    const rows = [
      mk({ eventName: "Purchase", status: "done" }),              // different key, done
      mk({ eventName: "CompleteRegistration", status: "pending" }),
    ];
    const due = dueRows(rows, now);
    expect(due).toHaveLength(1);
    expect(due[0].eventName).toBe("CompleteRegistration");
  });
});
