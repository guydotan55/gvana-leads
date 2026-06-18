import { POST } from "@/app/api/webhooks/facebook/route";

function req(body: string, sig?: string) {
  return new Request("https://x/api/webhooks/facebook", {
    method: "POST",
    headers: sig ? { "x-hub-signature-256": sig } : {},
    body,
  }) as any;
}

describe("webhook POST", () => {
  beforeAll(() => { process.env.FB_APP_SECRET = "s3cr3t"; });
  it("rejects a bad signature with 403", async () => {
    const res = await POST(req('{"object":"page","entry":[]}', "sha256=bad"));
    expect(res.status).toBe(403);
  });
});
