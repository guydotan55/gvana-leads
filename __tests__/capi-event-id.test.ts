import { sendCAPIEvent } from "@/lib/capi";

describe("sendCAPIEvent eventId", () => {
  const realFetch = global.fetch;
  beforeAll(() => {
    process.env.FB_PIXEL_ID = "PID";
    process.env.FB_ACCESS_TOKEN = "TOK";
  });
  afterEach(() => { global.fetch = realFetch; });

  it("includes event_id in the posted event when eventId is given", async () => {
    let body: any;
    global.fetch = (async (_url: string, init: any) => {
      body = JSON.parse(init.body);
      return { ok: true, text: async () => "" } as Response;
    }) as any;

    await sendCAPIEvent({ eventName: "Lead", eventId: "lead123", leadId: "lead123" });

    expect(body.data[0].event_id).toBe("lead123");
  });
});
