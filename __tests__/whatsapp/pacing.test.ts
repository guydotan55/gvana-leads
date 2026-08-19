import {
  computeJitterMs,
  acquireSendLock,
  releaseSendLock,
  isDailyCapReached,
} from "@/lib/whatsapp/pacing";

describe("computeJitterMs", () => {
  it("returns a value in [15000, 45000]", () => {
    for (let i = 0; i < 50; i++) {
      const ms = computeJitterMs();
      expect(ms).toBeGreaterThanOrEqual(15_000);
      expect(ms).toBeLessThanOrEqual(45_000);
    }
  });
});

describe("send lock", () => {
  it("serialises calls per sessionId", async () => {
    const events: string[] = [];
    async function run(label: string) {
      const release = await acquireSendLock("s1");
      events.push(`acquire-${label}`);
      await new Promise((r) => setTimeout(r, 5));
      events.push(`release-${label}`);
      release();
    }
    await Promise.all([run("a"), run("b")]);
    // Either a fully completes before b starts, or vice versa — no interleave
    const isInterleavedA = events.indexOf("acquire-a") < events.indexOf("acquire-b")
      && events.indexOf("release-a") < events.indexOf("acquire-b");
    const isInterleavedB = events.indexOf("acquire-b") < events.indexOf("acquire-a")
      && events.indexOf("release-b") < events.indexOf("acquire-a");
    expect(isInterleavedA || isInterleavedB).toBe(true);
  });

  it("locks are independent per sessionId", async () => {
    const r1 = await acquireSendLock("s1");
    const r2 = await acquireSendLock("s2"); // must resolve immediately
    expect(typeof r2).toBe("function");
    r1();
    r2();
  });
});

describe("isDailyCapReached", () => {
  it("returns false when counter < cap", async () => {
    const result = await isDailyCapReached({
      sessionId: "s1",
      cap: 60,
      countTodayForSession: async () => 10,
    });
    expect(result).toBe(false);
  });

  it("returns true when counter >= cap", async () => {
    const result = await isDailyCapReached({
      sessionId: "s1",
      cap: 60,
      countTodayForSession: async () => 60,
    });
    expect(result).toBe(true);
  });
});
