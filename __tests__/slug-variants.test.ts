import { slugVariants, findFormInList } from "@/lib/forms-repo";
import type { FormDef } from "@/config/forms";

function makeForm(id: string, overrides: Partial<FormDef> = {}): FormDef {
  return {
    id,
    title: "Test",
    status: "published",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    sheetTab: "Test",
    fields: [],
    ...overrides,
  };
}

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

/**
 * Round-trip integration tests for the production "Bug 2" scenario:
 * cloning the hardcoded "tech" form produces a Hebrew slug, the row is
 * stored in `_forms_meta`, and the user clicks the public URL. We
 * exercise findFormInList() with the various ways the slug can arrive
 * vs. the bytes we wrote.
 *
 * For Hebrew letters in the BMP (U+05D0-U+05EA), NFC and NFD produce
 * byte-identical output — there are no precomposed forms to decompose.
 * So the original "one-sided NFC normalization" theory does NOT explain
 * the production failure for the tech-clone case. The most plausible
 * remaining causes (handled by the new code path):
 *
 *   - The request slug arrives still percent-encoded from Next.js's
 *     edge layer (well-documented Next/Vercel behaviour for non-ASCII
 *     dynamic params).
 *   - Some upstream encodes the already-encoded slug a second time.
 *   - A Hebrew title containing niqud/cantillation marks (e.g.
 *     someone clones and renames) where stored bytes and arriving
 *     bytes happen to differ by NFC/NFD form.
 */
describe("findFormInList — Bug 2 production round-trip", () => {
  const TECH_CLONE_SLUG = "תוכנית-טכנולוגית-עותק";
  const stored: FormDef[] = [makeForm(TECH_CLONE_SLUG, { title: "תוכנית טכנולוגית (עותק)" })];

  it("finds a form when the slug round-trips byte-for-byte (baseline)", () => {
    const hit = findFormInList(stored, TECH_CLONE_SLUG);
    expect(hit?.id).toBe(TECH_CLONE_SLUG);
  });

  it("finds a form when the request arrives percent-encoded", () => {
    // Vercel / Next.js edge sometimes hands params.slug back still
    // URL-encoded for non-ASCII paths.
    const encoded = encodeURIComponent(TECH_CLONE_SLUG);
    const hit = findFormInList(stored, encoded);
    expect(hit?.id).toBe(TECH_CLONE_SLUG);
  });

  it("finds a form when the request arrives double-percent-encoded", () => {
    const once = encodeURIComponent(TECH_CLONE_SLUG);
    const twice = encodeURIComponent(once);
    const hit = findFormInList(stored, twice);
    expect(hit?.id).toBe(TECH_CLONE_SLUG);
  });

  it("returns null for a slug that doesn't exist", () => {
    expect(findFormInList(stored, "nonexistent-slug")).toBeNull();
  });

  it("returns null when an empty list is searched", () => {
    expect(findFormInList([], TECH_CLONE_SLUG)).toBeNull();
  });

  it("finds a niqud-containing slug across NFC/NFD divergence", () => {
    // Construct a string where NFC and NFD genuinely differ. The
    // Hebrew block alone doesn't produce divergence, so we mix in a
    // Latin char with a combining accent that DOES compose
    // (à = U+00E0 in NFC, a + U+0300 in NFD). This proves the
    // bidirectional NFC/NFD tolerance is real, not theatre.
    const nfc = "café-test".normalize("NFC");
    const nfd = "café-test".normalize("NFD");
    // Sanity: these MUST differ at the byte level or the test
    // is meaningless.
    expect(nfc).not.toBe(nfd);
    const list: FormDef[] = [makeForm(nfc)];
    // Sheets might round-trip NFD even though we wrote NFC, or the
    // request might arrive NFD from a Mac clipboard. Verify both
    // directions resolve.
    expect(findFormInList(list, nfc)?.id).toBe(nfc);
    expect(findFormInList(list, nfd)?.id).toBe(nfc);
    // And the reverse: stored NFD, request NFC.
    const listNfd: FormDef[] = [makeForm(nfd)];
    expect(findFormInList(listNfd, nfc)?.id).toBe(nfd);
  });

  it("finds a form when the request is percent-encoded AND in NFD form", () => {
    // Worst-case stacked transform: encoded NFD bytes.
    const nfc = "café-test".normalize("NFC");
    const nfd = "café-test".normalize("NFD");
    const list: FormDef[] = [makeForm(nfc)];
    const encodedNfd = encodeURIComponent(nfd);
    expect(findFormInList(list, encodedNfd)?.id).toBe(nfc);
  });
});
