import { fetchLead, fetchFormName } from "@/lib/leadgen";

describe("graph I/O", () => {
  const realFetch = global.fetch;
  beforeAll(() => { process.env.FB_ACCESS_TOKEN = "TOK"; });
  afterEach(() => { global.fetch = realFetch; });

  it("fetchLead requests the lead node and returns parsed json", async () => {
    let url = "";
    global.fetch = (async (u: string) => {
      url = u;
      return { ok: true, json: async () => ({ id: "l1", created_time: "t", field_data: [] }) } as Response;
    }) as any;
    const lead = await fetchLead("l1");
    expect(url).toContain("/v21.0/l1");
    expect(lead.id).toBe("l1");
  });

  it("fetchLead throws loudly on a non-ok response", async () => {
    global.fetch = (async () => ({ ok: false, status: 400, text: async () => "bad" } as Response)) as any;
    await expect(fetchLead("l1")).rejects.toThrow(/leadgen fetch failed/i);
  });

  it("fetchFormName returns the form name", async () => {
    global.fetch = (async () => ({ ok: true, json: async () => ({ name: "תוכנית משתמטים" }) } as Response)) as any;
    expect(await fetchFormName("f1")).toBe("תוכנית משתמטים");
  });
});
