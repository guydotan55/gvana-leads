"use client";

import { useEffect } from "react";

/**
 * Catches any uncaught error inside /form/[slug] (server or client).
 * Replaces Next.js's generic "Application error" with a Hebrew page
 * that explains what happened and offers a way back. The error
 * details (message + digest) are logged to the browser console so an
 * admin can copy-paste them.
 */
export default function FormSlugError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("/form/[slug] uncaught:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "linear-gradient(160deg, #f0f4f8 0%, #e8edf5 40%, #fdf5ee 100%)",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: 20,
          padding: 32,
          boxShadow: "0 6px 24px rgba(0,0,0,.06)",
          maxWidth: 560,
          width: "100%",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1d2752", margin: "0 0 8px" }}>
          אירעה שגיאה בטעינת הטופס
        </h1>
        <p style={{ color: "#6b7280", margin: "0 0 20px", lineHeight: 1.6 }}>
          לא ניתן להציג את הטופס כרגע. נסה לרענן את הדף, ואם הבעיה ממשיכה — דווח לצוות הטכני.
        </p>

        <details style={{ marginTop: 16, fontSize: 13, color: "#6b7280" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>פרטי שגיאה טכניים</summary>
          <div
            style={{
              marginTop: 8,
              padding: 12,
              background: "#fef2f2",
              border: "1px solid #fee2e2",
              borderRadius: 8,
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
              color: "#b91c1c",
            }}
          >
            <p style={{ margin: "0 0 4px" }} dir="ltr">
              <strong>message:</strong> {error.message || "(none)"}
            </p>
            {error.digest && (
              <p style={{ margin: 0 }} dir="ltr">
                <strong>digest:</strong> {error.digest}
              </p>
            )}
          </div>
        </details>

        <div style={{ marginTop: 24, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "10px 20px",
              background: "#1d2752",
              color: "white",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            נסה שוב
          </button>
          <a
            href="/"
            style={{
              padding: "10px 20px",
              background: "white",
              color: "#1d2752",
              border: "1.5px solid #e5e7eb",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            לדף הבית
          </a>
        </div>
      </div>
    </div>
  );
}
