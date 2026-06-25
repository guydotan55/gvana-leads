import { sendCAPIEvent } from "@/lib/capi";
import { alert } from "@/lib/alerts";

// Mock alert so the fail-loud path doesn't do real Sheet I/O in the test.
jest.mock("@/lib/alerts", () => ({ alert: jest.fn().mockResolvedValue(undefined) }));

describe("sendCAPIEvent config guard (fail loud on missing creds)", () => {
  const realFetch = global.fetch;
  const orig = { pid: process.env.FB_PIXEL_ID, tok: process.env.FB_ACCESS_TOKEN };
  let errSpy: jest.SpyInstance;

  beforeEach(() => {
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = realFetch;
    process.env.FB_PIXEL_ID = orig.pid;
    process.env.FB_ACCESS_TOKEN = orig.tok;
    (alert as jest.Mock).mockClear();
    errSpy.mockRestore();
  });

  it("alerts + returns false + skips the HTTP call when FB_ACCESS_TOKEN is missing while capi is on", async () => {
    process.env.FB_PIXEL_ID = "PID";
    delete process.env.FB_ACCESS_TOKEN;
    let fetched = false;
    global.fetch = (async () => {
      fetched = true;
      return { ok: true, text: async () => "" } as Response;
    }) as any;

    const ok = await sendCAPIEvent({ eventName: "qualified_lead", leadId: "l1" });

    expect(ok).toBe(false);
    expect(fetched).toBe(false); // never attempted the send
    expect(alert).toHaveBeenCalledTimes(1);
    expect((alert as jest.Mock).mock.calls[0][0]).toBe("capi-config-missing");
    expect((alert as jest.Mock).mock.calls[0][1]).toContain("FB_ACCESS_TOKEN");
    expect(errSpy).toHaveBeenCalledTimes(1); // also logs to Vercel runtime logs
  });

  it("does NOT alert when both creds are present (normal send proceeds)", async () => {
    process.env.FB_PIXEL_ID = "PID";
    process.env.FB_ACCESS_TOKEN = "TOK";
    global.fetch = (async () => ({ ok: true, text: async () => "" } as Response)) as any;

    const ok = await sendCAPIEvent({ eventName: "qualified_lead", leadId: "l1" });

    expect(ok).toBe(true);
    expect(alert).not.toHaveBeenCalled();
  });
});
