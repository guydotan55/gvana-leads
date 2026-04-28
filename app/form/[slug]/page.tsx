import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { getForm, listFormSlugs } from "@/lib/forms-repo";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";
import DynamicForm from "@/components/DynamicForm";

export const dynamic = "force-dynamic";

async function isAdminViewer(): Promise<boolean> {
  try {
    const token = cookies().get(SESSION_COOKIE)?.value;
    if (!token) return false;
    return await verifySession(token);
  } catch {
    return false;
  }
}

export default async function PublicDynamicFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const form = await getForm(slug);

  if (form && form.status === "published") {
    return (
      <Suspense>
        <DynamicForm form={form} />
      </Suspense>
    );
  }

  // Show full diagnostic only to logged-in admins. Anonymous visitors
  // see a generic "form not found" message — never the list of forms.
  const isAdmin = await isAdminViewer();
  const known = isAdmin ? await listFormSlugs().catch(() => []) : [];
  const slugBytes = Buffer.from(slug, "utf8").toString("hex");
  const matchById = known.find((f) => f.id === slug);

  let reason: string;
  if (form && form.status !== "published") {
    reason = "הטופס נמצא אבל סטטוס שלו עדיין 'טיוטה' — ערוך את הטופס בלוח הבקרה ולחץ 'פרסם טופס'.";
  } else if (matchById) {
    reason = "הטופס קיים אך מצב הפרסום לא תקין.";
  } else {
    reason = "הטופס המבוקש לא נמצא במערכת. ייתכן שהקישור שגוי או שהטופס נמחק.";
  }

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
          הטופס לא נמצא
        </h1>
        <p style={{ color: "#6b7280", margin: "0 0 20px", lineHeight: 1.6 }}>{reason}</p>

        {isAdmin && (
          <details style={{ marginTop: 16, fontSize: 13, color: "#6b7280" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>פרטי דיבאג (מנהל בלבד)</summary>
            <div style={{ marginTop: 8, padding: 12, background: "#f9fafb", borderRadius: 8, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
              <p>requested slug: <code dir="ltr">{slug}</code></p>
              <p>bytes (hex): <code dir="ltr">{slugBytes}</code></p>
              {known.length > 0 && (
                <>
                  <p style={{ marginTop: 8 }}>טפסים זמינים ({known.length}):</p>
                  <ul style={{ margin: "4px 0 0 16px", paddingInlineStart: 16 }}>
                    {known.map((f) => (
                      <li key={f.id}>
                        <code dir="ltr">{f.id}</code> — {f.title} ({f.status})
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </details>
        )}

        <div style={{ marginTop: 24 }}>
          <Link
            href="/"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              background: "#1d2752",
              color: "white",
              borderRadius: 10,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            לדף הבית
          </Link>
        </div>
      </div>
    </div>
  );
}
