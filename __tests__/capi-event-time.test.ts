import { sendCAPIEvent } from "@/lib/capi";

describe("sendCAPIEvent eventTime", () => {
  const realFetch = global.fetch;
  beforeAll(() => {
    process.env.FB_PIXEL_ID = "PID";
    process.env.FB_ACCESS_TOKEN = "TOK";
  });
  afterEach(() => { global.fetch = realFetch; });

  it("uses the provided eventTime as event_time", async () => {
    let body: any;
    global.fetch = (async (_url: string, init: any) => {
      body = JSON.parse(init.body);
      return { ok: true, text: async () => "" } as Response;
    }) as any;

    await sendCAPIEvent({ eventName: "CompleteRegistration", eventId: "l1", leadId: "l1", eventTime: 1700000000 });

    expect(body.data[0].event_time).toBe(1700000000);
  });

  it("falls back to now when eventTime is omitted", async () => {
    let body: any;
    global.fetch = (async (_url: string, init: any) => {
      body = JSON.parse(init.body);
      return { ok: true, text: async () => "" } as Response;
    }) as any;

    const before = Math.floor(Date.now() / 1000);
    await sendCAPIEvent({ eventName: "Lead", eventId: "l2", leadId: "l2" });
    const after = Math.floor(Date.now() / 1000);

    expect(body.data[0].event_time).toBeGreaterThanOrEqual(before);
    expect(body.data[0].event_time).toBeLessThanOrEqual(after);
  });

  it("falls back to now when eventTime is 0 (corrupt/blank outbox cell, would be rejected as >7d old)", async () => {
    let body: any;
    global.fetch = (async (_url: string, init: any) => {
      body = JSON.parse(init.body);
      return { ok: true, text: async () => "" } as Response;
    }) as any;

    const before = Math.floor(Date.now() / 1000);
    await sendCAPIEvent({ eventName: "CompleteRegistration", eventId: "l3", leadId: "l3", eventTime: 0 });
    const after = Math.floor(Date.now() / 1000);

    expect(body.data[0].event_time).toBeGreaterThanOrEqual(before);
    expect(body.data[0].event_time).toBeLessThanOrEqual(after);
  });
});
