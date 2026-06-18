import { createHmac } from "crypto";
import columnsConfig from "@/config/columns.json";
import {
  verifySignature, mapLeadToRow, extractName, extractPhone, sanitizeTabName,
} from "@/lib/leadgen";

describe("verifySignature", () => {
  const secret = "s3cr3t";
  const body = '{"a":1}';
  const good = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  it("accepts a correct signature", () => {
    expect(verifySignature(body, good, secret)).toBe(true);
  });
  it("rejects a wrong/missing signature", () => {
    expect(verifySignature(body, "sha256=deadbeef", secret)).toBe(false);
    expect(verifySignature(body, null, secret)).toBe(false);
    expect(verifySignature(body, "sha256=", secret)).toBe(false);      // empty hex
    expect(verifySignature(body, "sha256=xyz", secret)).toBe(false);   // invalid hex
  });
});

describe("field extraction", () => {
  it("prefers full_name, falls back to first+last", () => {
    expect(extractName([{ name: "full_name", values: ["Dana Levi"] }])).toBe("Dana Levi");
    expect(extractName([
      { name: "first_name", values: ["Dana"] },
      { name: "last_name", values: ["Levi"] },
    ])).toBe("Dana Levi");
  });
  it("reads phone_number or phone", () => {
    expect(extractPhone([{ name: "phone_number", values: ["+972501234567"] }])).toBe("+972501234567");
    expect(extractPhone([{ name: "phone", values: ["+972501234567"] }])).toBe("+972501234567");
  });
});

describe("mapLeadToRow", () => {
  it("places values at the columns.json indices, plain (no prefixes)", () => {
    const row = mapLeadToRow({
      id: "123", created_time: "2026-06-16T10:00:00+03:00",
      field_data: [
        { name: "full_name", values: ["Dana Levi"] },
        { name: "phone_number", values: ["+972501234567"] },
      ],
      form_id: "f1", platform: "ig", is_organic: false,
    }, "תוכנית משתמטים");
    const fb = columnsConfig.fbColumns;
    expect(row[fb.leadId.index]).toBe("123");
    expect(row[fb.formId.index]).toBe("f1");
    expect(row[fb.formName.index]).toBe("תוכנית משתמטים");
    expect(row[fb.fullName.index]).toBe("Dana Levi");
    expect(row[fb.phoneNumber.index]).toBe("+972501234567");
    expect(row.length).toBe(16);
  });
});

describe("sanitizeTabName", () => {
  it("strips apostrophes and dedups against existing names", () => {
    expect(sanitizeTabName("ל'ידים", [])).not.toContain("'");
    const out = sanitizeTabName("דרוש מדריך", ["דרוש מדריך"]);
    expect(out).not.toBe("דרוש מדריך");
  });
});
