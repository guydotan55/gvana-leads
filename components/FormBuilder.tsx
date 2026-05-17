"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { t } from "@/lib/i18n";
import DynamicForm from "@/components/DynamicForm";
import FieldBlockEditor from "@/components/FieldBlockEditor";
import FieldTypePicker from "@/components/FieldTypePicker";
import {
  STARTER_FIELDS,
  FORMS,
  type FormField,
  type FieldType,
  type FormDef,
} from "@/config/forms";

function makeFieldId(label: string, existing: FormField[]): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 30) || "field";
  const taken = new Set(existing.map((f) => f.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "טקסט",
  phone: "טלפון",
  email: "אימייל",
  number: "מספר",
  date: "תאריך",
  textarea: "טקסט ארוך",
  radio: "רשימה",
  checkbox: "בחירה מרובה",
};

function newField(type: FieldType, existing: FormField[]): FormField {
  const label = `${FIELD_TYPE_LABELS[type]} חדש`;
  const id = makeFieldId(`${type}_${existing.length + 1}`, existing);
  const base: FormField = { id, type, label, required: false };
  if (type === "radio" || type === "checkbox") {
    base.options = [
      { value: "אפשרות 1", label: "אפשרות 1" },
      { value: "אפשרות 2", label: "אפשרות 2" },
    ];
  }
  return base;
}

type SaveState = "idle" | "saving" | "saved" | "error" | "auth-expired";
type MobileTab = "edit" | "preview";

interface BuilderProps {
  editingId?: string;
}

export default function FormBuilder({ editingId }: BuilderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cloneSlug = searchParams.get("clone");

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [fields, setFields] = useState<FormField[]>(() => [...STARTER_FIELDS]);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [loading, setLoading] = useState(!!editingId || !!cloneSlug);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("edit");

  // The current form id once it's been persisted. For new forms we start
  // undefined and upgrade to the returned id after the first autosave.
  const [formId, setFormId] = useState<string | undefined>(editingId);

  // -------- Load existing form OR seed from clone --------
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (editingId) {
        try {
          const res = await fetch(`/api/forms/${encodeURIComponent(editingId)}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (cancelled) return;
          if (data?.form) {
            setTitle(data.form.title || "");
            setSubtitle(data.form.subtitle || "");
            setFields(data.form.fields?.length ? data.form.fields : [...STARTER_FIELDS]);
            setStatus(data.form.status === "published" ? "published" : "draft");
          }
        } catch (err) {
          if (!cancelled) {
            setSaveError(err instanceof Error ? err.message : "שגיאה בטעינת הטופס");
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      if (cloneSlug) {
        // 1) Try the hardcoded forms list.
        const hardcoded = FORMS.find((f) => f.slug === cloneSlug);
        if (hardcoded?.cloneTemplate) {
          if (cancelled) return;
          setTitle(`${hardcoded.title} (עותק)`);
          setSubtitle(hardcoded.subtitle);
          setFields(
            hardcoded.cloneTemplate.map((f) => ({ ...f, options: f.options ? [...f.options] : undefined })),
          );
          setStatus("draft");
          setLoading(false);
          return;
        }
        // 2) Fall back to builder forms — the source may be another
        //    user-created form via its id.
        try {
          const res = await fetch(`/api/forms/${encodeURIComponent(cloneSlug)}`);
          if (res.ok) {
            const data = await res.json();
            if (!cancelled && data?.form) {
              setTitle(`${data.form.title} (עותק)`);
              setSubtitle(data.form.subtitle || "");
              setFields(
                (data.form.fields?.length ? data.form.fields : [...STARTER_FIELDS]).map((f: FormField) => ({
                  ...f,
                  options: f.options ? [...f.options] : undefined,
                })),
              );
              setStatus("draft"); // always start clones as draft
            }
          }
        } catch {
          // non-fatal — fall through to empty starter fields
        }
        if (!cancelled) setLoading(false);
        return;
      }

      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [editingId, cloneSlug]);

  // -------- Field mutations --------
  const addField = useCallback((type: FieldType) => {
    setFields((prev) => [...prev, newField(type, prev)]);
    setShowPicker(false);
  }, []);
  const removeField = useCallback((id: string) => {
    if (id === "fullName" || id === "phone") return;
    setFields((prev) => prev.filter((f) => f.id !== id));
  }, []);
  const updateField = useCallback((id: string, patch: Partial<FormField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);
  const moveField = useCallback((id: string, dir: -1 | 1) => {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      if (idx === -1) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  // -------- Validation (preview-only — saves still go through) --------
  const previewForm = useMemo<FormDef>(
    () => ({
      id: formId || "preview",
      title: title || "הטופס שלך",
      subtitle: subtitle || undefined,
      status: "published",
      createdAt: "",
      updatedAt: "",
      sheetTab: "",
      fields,
    }),
    [formId, title, subtitle, fields],
  );

  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    if (!title.trim()) errs.push("הוספת שם לטופס");
    if (fields.length === 0) errs.push("הוספת לפחות שאלה אחת");
    const hasName = fields.some((f) => f.id === "fullName");
    const hasPhone = fields.some((f) => f.id === "phone");
    if (!hasName) errs.push("שדה שם מלא");
    if (!hasPhone) errs.push("שדה טלפון");
    for (const f of fields) {
      if (!f.label.trim()) {
        errs.push(`כותרת ריקה בשאלה`);
        break;
      }
      if ((f.type === "radio" || f.type === "checkbox") && (!f.options || f.options.length === 0)) {
        errs.push(`חסרות אפשרויות בשאלה "${f.label}"`);
      }
    }
    return errs;
  }, [title, fields]);

  // -------- Autosave (debounced 1.5s) --------
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const lastSavedSnapshot = useRef<string>("");
  // Don't autosave the empty seed before the user has touched anything.
  const userTouched = useRef(false);

  const persist = useCallback(
    async (overrideStatus?: "draft" | "published") => {
      if (inFlight.current) return;
      if (!title.trim() || validationErrors.length > 0) return;
      const payload = {
        title,
        subtitle,
        fields,
        status: overrideStatus || status,
      };
      const snapshot = JSON.stringify(payload);
      if (snapshot === lastSavedSnapshot.current && formId) return;
      inFlight.current = true;
      setSaveState("saving");
      setSaveError("");
      try {
        const method = formId ? "PUT" : "POST";
        const url = formId ? `/api/forms/${encodeURIComponent(formId)}` : "/api/forms";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: snapshot,
        });
        if (res.status === 401) {
          setSaveState("auth-expired");
          setSaveError("ההפעלה פגה — פתחי את הדף ב‑/login בכרטיסייה חדשה, התחברי, וחזרי לכאן");
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data?.form?.id && !formId) {
          setFormId(data.form.id);
          // Swap the URL to the edit route so a refresh doesn't fork
          // into a duplicate. replace() (not push) keeps history clean.
          router.replace(`/forms/${encodeURIComponent(data.form.id)}/edit`);
        }
        lastSavedSnapshot.current = snapshot;
        setSaveState("saved");
      } catch (err) {
        setSaveState("error");
        setSaveError(err instanceof Error ? err.message : "שגיאה בשמירה");
      } finally {
        inFlight.current = false;
      }
    },
    [title, subtitle, fields, status, formId, router, validationErrors.length],
  );

  // Mark user-touched once any state diverges from the load.
  useEffect(() => {
    if (loading) return;
    userTouched.current = true;
  }, [title, subtitle, fields, status, loading]);

  // Trigger debounced autosave.
  useEffect(() => {
    if (loading) return;
    if (!userTouched.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      persist();
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [title, subtitle, fields, status, persist, loading]);

  // Toggle publish — saves immediately at the new status, no debounce.
  async function togglePublished(next: boolean) {
    const nextStatus = next ? "published" : "draft";
    setStatus(nextStatus);
    // Persist immediately under the new status.
    await persist(nextStatus);
  }

  if (loading) {
    return <p className="text-gray-400">{t("common.loading")}</p>;
  }

  const isPublished = status === "published";
  const publicUrl = formId ? `/form/${encodeURIComponent(formId)}` : null;

  return (
    <div className="max-w-6xl mx-auto">
      {/* --- Top bar --- */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5 mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <Link href="/forms" className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 mb-2">
              ← חזרה לרשימת הטפסים
            </Link>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="שם הטופס"
              className="w-full text-2xl font-bold text-brand-navy bg-transparent border-0 outline-none focus:bg-gray-50 rounded px-2 -mx-2 py-0.5 placeholder:text-gray-300"
              aria-label="שם הטופס"
            />
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="תיאור קצר (אופציונלי)"
              className="w-full mt-1 text-sm text-gray-600 bg-transparent border-0 outline-none focus:bg-gray-50 rounded px-2 -mx-2 py-0.5 placeholder:text-gray-300"
              aria-label="תיאור קצר"
            />
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <PublishToggle
              checked={isPublished}
              onChange={togglePublished}
              disabled={!formId && validationErrors.length > 0}
            />
            <SaveIndicator state={saveState} />
          </div>
        </div>

        {saveError && (
          <div
            className={`mt-3 p-2.5 rounded-lg text-sm border ${
              saveState === "auth-expired"
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {saveError}
          </div>
        )}

        {isPublished && publicUrl && (
          <div className="mt-3 p-2.5 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-green-800">
              הטופס פתוח לקבלת הרשמות. הקישור הציבורי:
            </p>
            <code dir="ltr" className="font-mono text-xs text-gray-700 bg-white border border-gray-200 rounded px-2 py-1 truncate max-w-full">
              {publicUrl}
            </code>
          </div>
        )}
      </div>

      {/* --- Mobile tab toggle (sticky) --- */}
      <div className="md:hidden sticky top-0 z-10 bg-gray-50/95 backdrop-blur py-2 -mx-4 px-4 border-b border-gray-100 mb-3">
        <div className="inline-flex w-full bg-white border border-gray-200 rounded-lg p-0.5 shadow-sm">
          <button
            type="button"
            onClick={() => setMobileTab("edit")}
            className={`flex-1 min-h-[40px] rounded-md text-sm font-semibold transition-all ${
              mobileTab === "edit" ? "bg-brand-navy text-white shadow-sm" : "text-gray-600"
            }`}
          >
            עריכה
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("preview")}
            className={`flex-1 min-h-[40px] rounded-md text-sm font-semibold transition-all ${
              mobileTab === "preview" ? "bg-brand-navy text-white shadow-sm" : "text-gray-600"
            }`}
          >
            תצוגה מקדימה
          </button>
        </div>
      </div>

      {/* --- Two-pane layout --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left pane: editor */}
        <section
          className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5 ${
            mobileTab === "edit" ? "" : "hidden md:block"
          }`}
          aria-label="עריכת שאלות"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">שאלות הטופס</h2>
            <span className="text-xs text-gray-400">{fields.length} שאלות</span>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            שדות &quot;שם מלא&quot; ו&quot;טלפון&quot; הם בסיס הטופס ולא ניתן להסיר אותם.
          </p>

          <ol className="space-y-2.5">
            {fields.map((field, i) => (
              <FieldBlockEditor
                key={field.id}
                field={field}
                index={i}
                total={fields.length}
                isLocked={field.id === "fullName" || field.id === "phone"}
                onUpdate={(patch) => updateField(field.id, patch)}
                onRemove={() => removeField(field.id)}
                onMove={(dir) => moveField(field.id, dir)}
              />
            ))}
          </ol>

          <div className="mt-3">
            {showPicker ? (
              <FieldTypePicker
                onPick={(type) => addField(type)}
                onCancel={() => setShowPicker(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="w-full px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 text-sm font-semibold text-gray-600 hover:border-brand-sky hover:text-brand-sky hover:bg-sky-50/40 transition-colors min-h-[48px]"
              >
                + הוסף שדה
              </button>
            )}
          </div>

          {validationErrors.length > 0 && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs font-semibold text-amber-900 mb-1">לפני פרסום:</p>
              <ul className="text-xs text-amber-800 space-y-0.5 list-disc pe-4">
                {validationErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Right pane: live preview */}
        <section
          className={`bg-gradient-to-br from-blue-50 to-orange-50/30 rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${
            mobileTab === "preview" ? "" : "hidden md:block"
          }`}
          aria-label="תצוגה מקדימה"
        >
          <div className="px-4 sm:px-5 py-3 bg-white/70 border-b border-gray-100 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-700">תצוגה מקדימה</h2>
            <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-400">
              כך הטופס ייראה למבקרים
            </span>
          </div>
          <div className="preview-frame">
            <DynamicForm form={previewForm} preview />
          </div>
        </section>
      </div>

      <style jsx>{`
        /* Scope the preview's full-page background to its container.
           The inner DynamicForm uses position: fixed for its decoration
           blobs; we trap them with overflow + relative parent. */
        .preview-frame {
          position: relative;
          overflow: hidden;
          max-height: 75vh;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        .preview-frame :global(.form-page) {
          min-height: auto;
          padding: 20px 16px;
        }
        .preview-frame :global(.bg-decoration) {
          position: absolute;
        }
      `}</style>
    </div>
  );
}

/* ---------- Publish toggle ---------- */

function PublishToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label
      className={`inline-flex items-center gap-2 cursor-pointer select-none ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      }`}
      title={disabled ? "מלאי את שם הטופס והשדות החסרים לפני פתיחה לקבלת הרשמות" : ""}
    >
      <span className="text-sm font-semibold text-gray-800">פתח לקבלת הרשמות</span>
      <span
        className={`relative inline-block w-11 h-6 rounded-full transition-colors ${
          checked ? "bg-green-500" : "bg-gray-300"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
          aria-label="פתח לקבלת הרשמות"
        />
        <span
          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${
            checked ? "end-0.5" : "start-0.5"
          }`}
        />
      </span>
    </label>
  );
}

/* ---------- Save indicator ---------- */

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
        שומר…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-700">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        נשמר
      </span>
    );
  }
  if (state === "error") {
    return <span className="text-xs text-red-600">לא הצליח לשמור</span>;
  }
  if (state === "auth-expired") {
    return <span className="text-xs text-amber-700">ההפעלה פגה</span>;
  }
  return null;
}
