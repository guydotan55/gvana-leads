"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import type { FormDef, FormField } from "@/config/forms";
import { useFormView } from "@/lib/use-form-view";

interface Props {
  form: FormDef;
}

type FieldValue = string | string[];

export default function DynamicForm({ form }: Props) {
  useFormView(form.id, "builder");
  const searchParams = useSearchParams();
  const utmSource = searchParams.get("utm_source") || "";
  const utmMedium = searchParams.get("utm_medium") || "";
  const utmCampaign = searchParams.get("utm_campaign") || "";

  const [values, setValues] = useState<Record<string, FieldValue>>(() => {
    const initial: Record<string, FieldValue> = {};
    for (const field of form.fields) {
      initial[field.id] = field.type === "checkbox" ? [] : "";
    }
    return initial;
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function setValue(id: string, value: FieldValue) {
    setValues((prev) => ({ ...prev, [id]: value }));
  }

  function toggleCheckbox(id: string, opt: string) {
    setValues((prev) => {
      const current = (prev[id] as string[] | undefined) || [];
      const next = current.includes(opt)
        ? current.filter((v) => v !== opt)
        : [...current, opt];
      return { ...prev, [id]: next };
    });
  }

  const canSubmit = useMemo(() => {
    for (const field of form.fields) {
      if (!field.required) continue;
      const v = values[field.id];
      if (Array.isArray(v) ? v.length === 0 : !String(v ?? "").trim()) return false;
    }
    return true;
  }, [form.fields, values]);

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/forms/${form.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: values,
          utmSource,
          utmMedium,
          utmCampaign,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Submission failed");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשליחה, נסה שוב");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="form-page">
        <div className="bg-decoration">
          <div className="bg-blob bg-blob-1" />
          <div className="bg-blob bg-blob-2" />
        </div>
        <div className="form-container">
          <div className="form-card success-card">
            <div style={{ width: 64, height: 64, margin: "0 auto 20px", color: "#16a34a" }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2>הטופס נשלח בהצלחה!</h2>
            <p>ניצור איתך קשר בהקדם.</p>
          </div>
        </div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  return (
    <div className="form-page">
      <div className="bg-decoration">
        <div className="bg-blob bg-blob-1" />
        <div className="bg-blob bg-blob-2" />
        <div className="bg-blob bg-blob-3" />
      </div>

      <div className="form-container">
        <header className="form-header">
          <Image src="/logo-color.png" alt="מכינת גוונא" width={56} height={56} className="form-logo" />
          <h1>{form.title}</h1>
          {form.subtitle && <p className="subtitle">{form.subtitle}</p>}
        </header>

        <div className="form-card">
          <div className="step-content">
            {form.fields.map((field) => (
              <FieldRenderer
                key={field.id}
                field={field}
                value={values[field.id] || (field.type === "checkbox" ? [] : "")}
                onChange={(v) => setValue(field.id, v)}
                onToggle={(opt) => toggleCheckbox(field.id, opt)}
              />
            ))}

            {error && <p className="error-msg">{error}</p>}

            <div className="form-nav">
              <div className="nav-spacer" />
              <button
                type="button"
                className="btn-submit"
                disabled={!canSubmit || submitting}
                onClick={handleSubmit}
              >
                {submitting ? "שולח..." : "שליחה"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{styles}</style>
    </div>
  );
}

function FieldRenderer({
  field,
  value,
  onChange,
  onToggle,
}: {
  field: FormField;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  onToggle: (opt: string) => void;
}) {
  switch (field.type) {
    case "textarea":
      return (
        <div className="field">
          <label htmlFor={field.id}>{field.label}{field.required && " *"}</label>
          <textarea
            id={field.id}
            required={field.required}
            value={String(value || "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={4}
          />
        </div>
      );
    case "radio":
      return (
        <div className="field">
          <label>{field.label}{field.required && " *"}</label>
          <div className="radio-group">
            {(field.options || []).map((opt) => {
              const selected = value === opt.value;
              return (
                <label key={opt.value} className={`radio-option ${selected ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name={field.id}
                    checked={selected}
                    onChange={() => onChange(opt.value)}
                  />
                  <span className="radio-circle">{selected && <span className="radio-dot" />}</span>
                  <span className="radio-label">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      );
    case "checkbox":
      return (
        <div className="field">
          <label>{field.label}{field.required && " *"}</label>
          <span className="field-hint">ניתן לבחור יותר מאפשרות אחת</span>
          <div className="checkbox-group">
            {(field.options || []).map((opt) => {
              const arr = (value as string[] | undefined) || [];
              const selected = arr.includes(opt.value);
              return (
                <label key={opt.value} className={`checkbox-option ${selected ? "selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggle(opt.value)}
                  />
                  <span className="checkbox-box">
                    {selected && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <span className="checkbox-label">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      );
    case "phone":
      return (
        <div className="field">
          <label htmlFor={field.id}>{field.label}{field.required && " *"}</label>
          <input
            id={field.id}
            type="tel"
            required={field.required}
            value={String(value || "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
          />
        </div>
      );
    case "email":
      return (
        <div className="field">
          <label htmlFor={field.id}>{field.label}{field.required && " *"}</label>
          <input
            id={field.id}
            type="email"
            required={field.required}
            value={String(value || "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            dir="ltr"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>
      );
    case "number":
      return (
        <div className="field">
          <label htmlFor={field.id}>{field.label}{field.required && " *"}</label>
          <input
            id={field.id}
            type="number"
            required={field.required}
            value={String(value || "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            dir="ltr"
            inputMode="numeric"
          />
        </div>
      );
    case "date":
      return (
        <div className="field">
          <label htmlFor={field.id}>{field.label}{field.required && " *"}</label>
          <input
            id={field.id}
            type="date"
            required={field.required}
            value={String(value || "")}
            onChange={(e) => onChange(e.target.value)}
            dir="ltr"
          />
        </div>
      );
    default:
      return (
        <div className="field">
          <label htmlFor={field.id}>{field.label}{field.required && " *"}</label>
          <input
            id={field.id}
            type="text"
            required={field.required}
            value={String(value || "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            autoComplete={field.id === "fullName" ? "name" : undefined}
          />
        </div>
      );
  }
}

const styles = `
  /* Mobile-first base. Desktop overrides at the bottom. */
  .form-page {
    min-height: 100dvh;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 16px 16px calc(env(safe-area-inset-bottom, 0px) + 32px);
    position: relative;
    overflow-x: hidden;
    background: linear-gradient(160deg, #f0f4f8 0%, #e8edf5 40%, #fdf5ee 100%);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    -webkit-text-size-adjust: 100%;
    -webkit-tap-highlight-color: transparent;
  }
  .bg-decoration { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
  .bg-blob { position: absolute; border-radius: 50%; filter: blur(70px); opacity: 0.12; }
  .bg-blob-1 { width: 260px; height: 260px; background: #0EA5E9; top: -60px; right: -80px; }
  .bg-blob-2 { width: 220px; height: 220px; background: #d9642c; bottom: -60px; left: -80px; }
  .bg-blob-3 { width: 200px; height: 200px; background: #ec9e3f; top: 50%; left: 50%; transform: translate(-50%, -50%); }
  .form-container { position: relative; z-index: 1; width: 100%; max-width: 520px; display: flex; flex-direction: column; gap: 14px; }

  .form-header { text-align: center; padding: 8px 0 0; }
  .form-header h1 { font-size: 22px; font-weight: 700; color: #1d2752; margin: 10px 0 6px; line-height: 1.3; }
  .subtitle { font-size: 14.5px; color: #6b7280; margin: 0; line-height: 1.55; }

  .form-card {
    background: white; border-radius: 20px; padding: 20px 18px;
    box-shadow: 0 1px 3px rgba(0,0,0,.04), 0 6px 24px rgba(0,0,0,.06);
    border: 1px solid rgba(255,255,255,.8);
  }
  .success-card { text-align: center; padding: 48px 24px; margin-top: 40px; }
  .success-card h2 { font-size: 22px; font-weight: 700; color: #1d2752; margin: 0 0 8px; }
  .success-card p { font-size: 15px; color: #6b7280; margin: 0; }

  .step-content { display: flex; flex-direction: column; gap: 16px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field label { font-size: 14.5px; font-weight: 600; color: #374151; line-height: 1.5; }
  .field-hint { font-size: 13.5px; color: #9ca3af; margin-top: -2px; line-height: 1.4; }

  .field input, .field textarea {
    width: 100%;
    padding: 14px 16px;
    border: 1.5px solid #e5e7eb;
    border-radius: 12px;
    font-size: 16px;          /* 16px keeps iOS from auto-zooming on focus */
    color: #1f2937;
    background: #fafbfc;
    outline: none;
    transition: border-color .2s, background .2s, box-shadow .2s;
    font-family: inherit;
    box-sizing: border-box;
    resize: vertical;
    -webkit-appearance: none;
    appearance: none;
    min-height: 48px;
  }
  .field textarea { min-height: 96px; line-height: 1.5; }
  .field input:focus, .field textarea:focus {
    border-color: #0EA5E9; background: white;
    box-shadow: 0 0 0 3px rgba(14,165,233,.18);
  }
  .field input::placeholder, .field textarea::placeholder { color: #b0b8c4; }
  .field input[type="date"] { padding-block: 12px; }

  /* Radio + checkbox use the whole row as the touch target so it's
     comfortable on small screens. min-height stays at recommended 52px. */
  .radio-group, .checkbox-group { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
  .radio-option, .checkbox-option {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 16px;
    min-height: 52px;
    border: 1.5px solid #e5e7eb; border-radius: 12px; background: #fafbfc;
    cursor: pointer; transition: border-color .15s, background .15s, transform .1s;
    user-select: none;
    position: relative;
  }
  .radio-option:active, .checkbox-option:active { transform: scale(0.99); }
  @media (hover: hover) {
    .radio-option:hover, .checkbox-option:hover { border-color: #d1d5db; background: #f3f4f6; }
  }
  .radio-option.selected, .checkbox-option.selected { border-color: #0EA5E9; background: #f0f9ff; }
  .radio-option input, .checkbox-option input { position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none; }
  .radio-circle, .checkbox-box {
    width: 24px; height: 24px; flex-shrink: 0;
    border: 2px solid #d1d5db; display: flex; align-items: center; justify-content: center;
    transition: border-color .15s, background .15s;
  }
  .radio-circle { border-radius: 50%; }
  .checkbox-box { border-radius: 6px; }
  .radio-option.selected .radio-circle { border-color: #0EA5E9; }
  .radio-dot { width: 12px; height: 12px; border-radius: 50%; background: #0EA5E9; }
  .checkbox-option.selected .checkbox-box { background: #0EA5E9; border-color: #0EA5E9; }
  .checkbox-box svg { width: 14px; height: 14px; color: white; }
  .radio-label, .checkbox-label {
    font-size: 15.5px; color: #374151; font-weight: 500; line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .form-nav {
    display: flex; align-items: stretch; gap: 12px;
    margin-top: 8px; padding-top: 16px; border-top: 1px solid #f3f4f6;
  }
  .nav-spacer { display: none; }
  .btn-submit {
    flex: 1; width: 100%;
    padding: 14px 24px;
    border: none; border-radius: 12px;
    background: linear-gradient(135deg, #d9642c 0%, #ec9e3f 100%);
    color: white; font-size: 16.5px; font-weight: 700;
    cursor: pointer; transition: transform .15s, box-shadow .2s, opacity .2s;
    font-family: inherit; min-height: 52px;
    box-shadow: 0 2px 8px rgba(217,100,44,.3);
    -webkit-tap-highlight-color: transparent;
  }
  .btn-submit:active:not(:disabled) { transform: translateY(1px); }
  @media (hover: hover) {
    .btn-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(217,100,44,.35); }
  }
  .btn-submit:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }

  .error-msg {
    color: #dc2626; font-size: 14px; text-align: center;
    margin: 8px 0 0; padding: 10px 12px;
    background: #fef2f2; border: 1px solid #fee2e2; border-radius: 10px;
  }

  /* Tablet and up */
  @media (min-width: 640px) {
    .form-page { padding: 40px 24px 60px; align-items: center; }
    .form-header h1 { font-size: 26px; }
    .form-card { padding: 32px; }
    .bg-blob-1 { width: 360px; height: 360px; right: -100px; }
    .bg-blob-2 { width: 280px; height: 280px; }
    .bg-blob-3 { width: 240px; height: 240px; }
    .form-nav { align-items: center; }
    .nav-spacer { display: block; flex: 1; }
    .btn-submit { flex: initial; width: auto; padding: 14px 32px; min-width: 160px; }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .radio-option, .checkbox-option, .btn-submit, .field input, .field textarea {
      transition: none;
    }
  }
`;
