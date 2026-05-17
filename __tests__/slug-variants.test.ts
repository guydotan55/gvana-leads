import { slugVariants } from "@/lib/forms-repo";

describe("slugVariants — Bug 2 lookup resilience", () => {
  it("includes the input itself", () => {
    const v = slugVariants("hello");
    expect(v).toContain("hello");
  });

  it("decodes percent-encoded Hebrew", () => {
    const encoded = encodeURIComponent("תוכנית-טכנולוגית-עותק");
    const v = slugVariants(encoded);
    expect(v).toContain("תוכנית-טכנולוגית-עותק");
  });

  it("produces both NFC and NFD forms when the input has a composed/decomposed char", () => {
    // Hebrew with niqud "שָׁ" (Shin with shin-dot and qamatz) — common
    // place where NFC vs NFD diverges. The base letter + marks vs the
    // precomposed form should both be discoverable.
    const nfc = "שָׁלום".normalize("NFC");
    const nfd = "שָׁלום".normalize("NFD");
    const v = slugVariants(nfc);
    expect(v).toContain(nfc);
    // NFD form should also be present (we add both normalization forms)
    expect(v).toContain(nfd);
  });

  it("handles double-encoded slugs without throwing", () => {
    const once = encodeURIComponent("טופס");
    const twice = encodeURIComponent(once);
    const v = slugVariants(twice);
    expect(v).toContain("טופס");
  });

  it("returns at least one entry for a plain ASCII slug", () => {
    const v = slugVariants("student");
    expect(v.length).toBeGreaterThan(0);
    expect(v).toContain("student");
  });

  it("tolerates malformed percent-encoding without throwing", () => {
    expect(() => slugVariants("%E0%A4")).not.toThrow();
    const v = slugVariants("bad%E0%A4");
    expect(v).toContain("bad%E0%A4");
  });
});
