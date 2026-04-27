"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { t } from "@/lib/i18n";
import {
  STARTER_FIELDS,
  FORMS,
  type FormField,
  type FieldType,
  type FieldOption,
} from "@/config/forms";

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "טקסט קצר",
  phone: "טלפון",
  email: "אימייל",
  number: "מספר",
  date: "תאריך",
  textarea: "טקסט ארוך",
  radio: "בחירה יחידה",
  checkbox: "בחירה מרובה",
};

const FIELD_TYPE_ICONS: Record<FieldType, string> = {
  text: "Aa",
  phone: "☏",
  email: "@",
  number: "123",
  date: "📅",
  textarea: "¶",
  radio: "◉",
  checkbox: "☑",
};

const ALL_FIELD_TYPES: FieldType[] = [
  "text",
  "phone",
  "email",
  "number",
  "date",
  "textarea",
  "radio",
  "checkbox",
];

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

interface BuilderProps {
  editingId?: string;
}

export default function FormBuilder({ editingId }: BuilderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cloneSlug = searchParams.get("clone");

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [fields, setFields] = useState<FormField[]>(() => [...STARTER_FIELDS]);
  const [loading, setLoading] = useState(!!editingId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Load existing form for edit, or seed from a clone source
  useEffect(() => {
    if (editingId) {
      fetch(`/api/forms/${editingId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.form) {
            setTitle(data.form.title || "");
            setSubtitle(data.form.subtitle || "");
            setFields(data.form.fields?.length ? data.form.fields : [...STARTER_FIELDS]);
          }
        })
        .catch(() => setSaveError("שגיאה בטעינת הטופס"))
        .finally(() => setLoading(false));
    } else if (cloneSlug) {
      const source = FORMS.find((f) => f.slug === cloneSlug);
      if (source?.cloneTemplate) {
        setTitle(`${source.title} (עותק)`);
        setSubtitle(source.subtitle);
        setFields(source.cloneTemplate.map((f) => ({ ...f, options: f.options ? [...f.options] : undefined })));
      }
    }
  }, [editingId, cloneSlug]);

  const canStep1 = title.trim().length > 0;
  const canStep2 = useMemo(() => {
    if (fields.length === 0) return false;
    const hasName = fields.some((f) => f.id === "fullName" || (f.type === "text" && f.required));
    const hasPhone = fields.some((f) => f.type === "phone" && f.required);
    if (!hasName || !hasPhone) return false;
    for (const field of fields) {
      if (!field.label.trim()) return false;
      if ((field.type === "radio" || field.type === "checkbox") && (!field.options || field.options.length === 0)) {
        return false;
      }
    }
    return true;
  }, [fields]);

  function addField(type: FieldType) {
    setFields((prev) => [...prev, newField(type, prev)]);
  }
  function removeField(id: string) {
    if (id === "fullName" || id === "phone") return;
    setFields((prev) => prev.filter((f) => f.id !== id));
  }
  function updateField(id: string, patch: Partial<FormField>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }
  function moveField(id: string, dir: -1 | 1) {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      if (idx === -1) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  async function handlePublish() {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const method = editingId ? "PUT" : "POST";
      const url = editingId ? `/api/forms/${editingId}` : "/api/forms";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, subtitle, fields, status: "published" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      router.push("/forms");
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-gray-400">{t("common.loading")}</p>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <header className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">
            {editingId ? "עריכת טופס" : "טופס חדש"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            צור טופס לידים חדש ב-3 שלבים פשוטים
          </p>
        </div>
        <Link href="/forms" className="text-sm text-gray-500 hover:text-gray-700">
          ← חזרה לרשימת הטפסים
        </Link>
      </header>

      <StepperBar step={step} />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-7 mt-4">
        {step === 1 && (
          <Step1Basics
            title={title}
            subtitle={subtitle}
            onTitle={setTitle}
            onSubtitle={setSubtitle}
            onNext={() => setStep(2)}
            canNext={canStep1}
          />
        )}
        {step === 2 && (
          <Step2Fields
            fields={fields}
            onAdd={addField}
            onRemove={removeField}
            onUpdate={updateField}
            onMove={moveField}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            canNext={canStep2}
          />
        )}
        {step === 3 && (
          <Step3Preview
            title={title}
            subtitle={subtitle}
            fields={fields}
            onBack={() => setStep(2)}
            onPublish={handlePublish}
            saving={saving}
            error={saveError}
            isEditing={!!editingId}
          />
        )}
      </div>
    </div>
  );
}

/* ---------- Stepper bar ---------- */

function StepperBar({ step }: { step: 1 | 2 | 3 }) {
  const items = [
    { n: 1, label: "פרטי הטופס" },
    { n: 2, label: "שאלות" },
    { n: 3, label: "תצוגה ופרסום" },
  ];
  return (
    <ol className="flex items-center gap-2 sm:gap-3" aria-label="שלבים">
      {items.map((item, i) => {
        const active = step === item.n;
        const done = step > item.n;
        return (
          <li key={item.n} className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold flex-1 min-w-0 transition-colors ${
                active
                  ? "bg-brand-navy text-white shadow-md"
                  : done
                  ? "bg-green-50 text-green-700 ring-1 ring-green-200"
                  : "bg-gray-50 text-gray-400"
              }`}
            >
              <span
                className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  active ? "bg-white/20" : done ? "bg-green-200" : "bg-gray-200"
                }`}
              >
                {done ? "✓" : item.n}
              </span>
              <span className="truncate">{item.label}</span>
            </div>
            {i < items.length - 1 && <span className="hidden sm:block w-4 h-px bg-gray-200" />}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Step 1: Basics ---------- */

function Step1Basics({
  title,
  subtitle,
  onTitle,
  onSubtitle,
  onNext,
  canNext,
}: {
  title: string;
  subtitle: string;
  onTitle: (v: string) => void;
  onSubtitle: (v: string) => void;
  onNext: () => void;
  canNext: boolean;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">שם הטופס *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="לדוגמה: קמפיין אביב 2026"
          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-base focus:border-brand-sky focus:ring-2 focus:ring-brand-sky/20 outline-none"
        />
        <p className="text-xs text-gray-500 mt-1">
          השם יוצג בראש הטופס ויהיה גם שם הטאב בגיליון
        </p>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">תיאור קצר (אופציונלי)</label>
        <input
          type="text"
          value={subtitle}
          onChange={(e) => onSubtitle(e.target.value)}
          placeholder="המשפט שמתחת לכותרת"
          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-base focus:border-brand-sky focus:ring-2 focus:ring-brand-sky/20 outline-none"
        />
      </div>
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          className="px-6 py-2.5 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 text-white text-sm font-bold shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          המשך →
        </button>
      </div>
    </div>
  );
}

/* ---------- Step 2: Fields ---------- */

function Step2Fields({
  fields,
  onAdd,
  onRemove,
  onUpdate,
  onMove,
  onBack,
  onNext,
  canNext,
}: {
  fields: FormField[];
  onAdd: (type: FieldType) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<FormField>) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onBack: () => void;
  onNext: () => void;
  canNext: boolean;
}) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">שאלות הטופס</h2>
        <p className="text-xs text-gray-500 mt-1">
          שדות &quot;שם מלא&quot; ו&quot;טלפון&quot; הם שדות חובה ומוצמדים. אפשר לערוך את הכותרת אבל לא להסיר אותם.
        </p>
      </div>

      <ol className="space-y-2">
        {fields.map((field, i) => (
          <FieldEditor
            key={field.id}
            field={field}
            index={i}
            total={fields.length}
            isLocked={field.id === "fullName" || field.id === "phone"}
            onRemove={() => onRemove(field.id)}
            onUpdate={(patch) => onUpdate(field.id, patch)}
            onMove={(dir) => onMove(field.id, dir)}
          />
        ))}
      </ol>

      <div className="relative">
        <button
          type="button"
          onClick={() => setShowAddMenu((v) => !v)}
          className="w-full px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 text-sm font-semibold text-gray-600 hover:border-brand-sky hover:text-brand-sky hover:bg-sky-50/40 transition-colors"
        >
          + הוסף שאלה
        </button>
        {showAddMenu && (
          <div className="absolute z-10 inset-x-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg p-2 grid grid-cols-2 gap-1">
            {ALL_FIELD_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  onAdd(type);
                  setShowAddMenu(false);
                }}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50 text-start"
              >
                <span className="w-7 h-7 rounded-md bg-gray-100 text-gray-600 font-mono text-xs flex items-center justify-center">
                  {FIELD_TYPE_ICONS[type]}
                </span>
                {FIELD_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900"
        >
          ← חזור
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          className="px-6 py-2.5 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 text-white text-sm font-bold shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          המשך →
        </button>
      </div>
    </div>
  );
}

function FieldEditor({
  field,
  index,
  total,
  isLocked,
  onRemove,
  onUpdate,
  onMove,
}: {
  field: FormField;
  index: number;
  total: number;
  isLocked: boolean;
  onRemove: () => void;
  onUpdate: (patch: Partial<FormField>) => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasOptions = field.type === "radio" || field.type === "checkbox";
  return (
    <li className="bg-gray-50/50 border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-30"
            aria-label="העלה"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-30"
            aria-label="הורד"
          >
            ▼
          </button>
        </div>
        <span className="w-7 h-7 rounded-md bg-white text-gray-600 font-mono text-xs flex items-center justify-center border border-gray-200 shrink-0">
          {FIELD_TYPE_ICONS[field.type]}
        </span>
        <input
          type="text"
          value={field.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="flex-1 min-w-0 px-2 py-1.5 bg-white border border-gray-200 rounded-md text-sm font-medium focus:border-brand-sky focus:ring-1 focus:ring-brand-sky/30 outline-none"
        />
        <span className="text-xs text-gray-500 shrink-0 hidden sm:inline">{FIELD_TYPE_LABELS[field.type]}</span>
        <label className="flex items-center gap-1 text-xs text-gray-600 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onUpdate({ required: e.target.checked })}
            disabled={isLocked}
            className="rounded"
          />
          חובה
        </label>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-7 h-7 rounded-md text-gray-500 hover:text-gray-800 hover:bg-white"
          title="ערוך הגדרות"
          aria-label="ערוך הגדרות"
        >
          ⚙
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={isLocked}
          className="w-7 h-7 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
          title={isLocked ? "שדה מוצמד" : "מחק"}
          aria-label="מחק"
        >
          ✕
        </button>
      </div>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-200 bg-white">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">טקסט עזר (placeholder)</label>
            <input
              type="text"
              value={field.placeholder || ""}
              onChange={(e) => onUpdate({ placeholder: e.target.value })}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm"
            />
          </div>
          {hasOptions && (
            <OptionsEditor
              options={field.options || []}
              onChange={(options) => onUpdate({ options })}
            />
          )}
        </div>
      )}
    </li>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: FieldOption[];
  onChange: (next: FieldOption[]) => void;
}) {
  function update(i: number, patch: Partial<FieldOption>) {
    const next = options.map((o, idx) => (idx === i ? { ...o, ...patch } : o));
    onChange(next);
  }
  function remove(i: number) {
    onChange(options.filter((_, idx) => idx !== i));
  }
  function add() {
    const n = options.length + 1;
    const label = `אפשרות ${n}`;
    onChange([...options, { value: label, label }]);
  }
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">אפשרויות</label>
      <div className="space-y-1.5">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={opt.label}
              onChange={(e) => update(i, { label: e.target.value, value: e.target.value })}
              className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-sm"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={options.length <= 1}
              className="w-7 h-7 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30"
              aria-label="מחק אפשרות"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-2 text-xs font-semibold text-brand-sky hover:underline"
      >
        + הוסף אפשרות
      </button>
    </div>
  );
}

/* ---------- Step 3: Preview & Publish ---------- */

function Step3Preview({
  title,
  subtitle,
  fields,
  onBack,
  onPublish,
  saving,
  error,
  isEditing,
}: {
  title: string;
  subtitle: string;
  fields: FormField[];
  onBack: () => void;
  onPublish: () => void;
  saving: boolean;
  error: string;
  isEditing: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">תצוגה מקדימה</h2>
        <p className="text-xs text-gray-500 mt-1">כך הטופס ייראה למבקרים. בדוק ואחר כך פרסם.</p>
      </div>

      <div className="bg-gradient-to-br from-blue-50 to-orange-50/30 border border-gray-200 rounded-xl p-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 max-w-md mx-auto">
          <h3 className="text-lg font-bold text-brand-navy text-center mb-1">{title || "—"}</h3>
          {subtitle && <p className="text-sm text-gray-500 text-center mb-4">{subtitle}</p>}
          <div className="space-y-3">
            {fields.map((field) => (
              <PreviewField key={field.id} field={field} />
            ))}
            <button
              type="button"
              disabled
              className="w-full py-2.5 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 text-white text-sm font-bold opacity-90 cursor-default"
            >
              שליחה
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={onBack}
          disabled={saving}
          className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900"
        >
          ← חזור
        </button>
        <button
          type="button"
          onClick={onPublish}
          disabled={saving}
          className="px-6 py-2.5 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 text-white text-sm font-bold shadow-md hover:shadow-lg disabled:opacity-50 transition-all"
        >
          {saving ? "שומר..." : isEditing ? "שמור שינויים" : "פרסם טופס"}
        </button>
      </div>
    </div>
  );
}

function PreviewField({ field }: { field: FormField }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">
        {field.label}{field.required && " *"}
      </label>
      {field.type === "textarea" ? (
        <textarea disabled rows={2} placeholder={field.placeholder} className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-sm" />
      ) : field.type === "radio" || field.type === "checkbox" ? (
        <div className="space-y-1">
          {(field.options || []).slice(0, 3).map((opt) => (
            <div key={opt.value} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-700">
              <span className="w-3.5 h-3.5 border border-gray-400 rounded-sm" />
              {opt.label}
            </div>
          ))}
          {(field.options?.length || 0) > 3 && (
            <p className="text-[11px] text-gray-400 px-2">ועוד {(field.options?.length || 0) - 3}…</p>
          )}
        </div>
      ) : (
        <input
          type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
          disabled
          placeholder={field.placeholder}
          className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-sm"
        />
      )}
    </div>
  );
}
