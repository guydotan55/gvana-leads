import { clientConfig } from "@/client.config";

const COUNTRY_CODES: Record<string, string> = {
  he: "972",
  en: "1",
};

/**
 * Normalize any phone number to E.164 format.
 * Examples:
 *   050-1234567     → +972501234567  (locale: he)
 *   0501234567      → +972501234567  (locale: he)
 *   +972501234567   → +972501234567
 *   (555) 123-4567  → +15551234567   (locale: en)
 */
export function normalizePhone(phone: string, locale?: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");

  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  const countryCode = COUNTRY_CODES[locale || clientConfig.locale] || "972";

  if (countryCode === "972" && cleaned.startsWith("0")) {
    return `+972${cleaned.slice(1)}`;
  }

  if (countryCode === "1" && cleaned.length === 10) {
    return `+1${cleaned}`;
  }

  if (countryCode === "1" && cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+${cleaned}`;
  }

  if (cleaned.startsWith(countryCode)) {
    return `+${cleaned}`;
  }

  return `+${countryCode}${cleaned}`;
}
