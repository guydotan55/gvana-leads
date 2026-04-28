"use client";

import { useEffect } from "react";

/**
 * Fire one view event per mount to /api/form-views/[slug]. Best-effort —
 * never blocks the form UX. Used by every form component (hardcoded +
 * builder) to populate the analytics counts on /forms.
 */
export function useFormView(slug: string, source: "hardcoded" | "builder"): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!slug) return;
    const params = new URLSearchParams(window.location.search);
    const body = JSON.stringify({
      source,
      utmSource: params.get("utm_source") || undefined,
      utmMedium: params.get("utm_medium") || undefined,
      utmCampaign: params.get("utm_campaign") || undefined,
    });
    try {
      fetch(`/api/form-views/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch {
      // ignore
    }
  }, [slug, source]);
}
