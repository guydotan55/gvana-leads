"use client";

import { useState } from "react";
import type { FormField, FieldOption, FieldType } from "@/config/forms";

const TYPE_LABELS: Record<FieldType, string> = {
  text: "טקסט",
  phone: "טלפון",
  email: "אימייל",
  number: "מספר",
  date: "תאריך",
  textarea: "טקסט ארוך",
  radio: "רשימה",
  checkbox: "בחירה מרובה",
};

/**
 * Per-field editor. Always-visible: label, required toggle, (for
 * choice fields) options list, move/delete handles. Behind the
 * "אפשרויות מתקדמות" disclosure: help text, placeholder, validation
 * pattern, conditional-logic placeholder.
 */
export default function FieldBlockEditor({
  field,
  index,
  total,
  isLocked,
  onUpdate,
  onRemove,
  onMove,
}: {
  field: FormField;
  index: number;
  total: number;
  isLocked: boolean;
  onUpdate: (patch: Partial<FormField>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const hasOptions = field.type === "radio" || field.type === "checkbox";

  return (
    <li className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-start gap-2 px-3 py-3">
        {/* Reorder via ▲▼ buttons. Decorative drag-handle cue removed —
            we don't wire HTML5 DnD because (a) it doesn't work on
            touch which is half our audience, and (b) showing a handle
            that does nothing trains the user that the UI is broken. */}
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="w-12 h-12 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-30"
            aria-label="העלה"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="w-12 h-12 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-30"
            aria-label="הורד"
          >
            ▼
          </button>
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={field.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              placeholder="שם השאלה"
              className="flex-1 min-w-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-medium focus:border-brand-sky focus:ring-2 focus:ring-brand-sky/20 outline-none min-h-[48px]"
              aria-label="שם השאלה"
            />
            <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 shrink-0 hidden sm:inline">
              {TYPE_LABELS[field.type]}
            </span>
          </div>

          {hasOptions && (
            <OptionsEditor
              options={field.options || []}
              onChange={(options) => onUpdate({ options })}
            />
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-sm text-gray-700 select-none cursor-pointer min-h-[48px] px-2 -mx-2">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => onUpdate({ required: e.target.checked })}
                disabled={isLocked}
                className="w-5 h-5 rounded"
              />
              שאלת חובה
            </label>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 min-h-[48px] px-2 -mx-2"
              aria-expanded={showAdvanced}
            >
              <span style={{ transform: showAdvanced ? "rotate(90deg)" : "rotate(0)", transition: "transform .15s" }}>▸</span>
              אפשרויות מתקדמות
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-2 border-t border-gray-100 pt-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">טקסט עזר (placeholder)</label>
                <input
                  type="text"
                  value={field.placeholder || ""}
                  onChange={(e) => onUpdate({ placeholder: e.target.value })}
                  placeholder="לדוגמה: 050-0000000"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm min-h-[48px]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  תבנית לבדיקה (regex, אופציונלי)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={field.validationPattern || ""}
                  onChange={(e) => onUpdate({ validationPattern: e.target.value })}
                  placeholder="^[0-9]+$"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-mono min-h-[48px]"
                />
                <p className="text-[11px] text-gray-400 mt-1">תכונה זו תתווסף בקרוב — הערך יישמר כעת ולא יופעל.</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1">תנאים להצגת השדה</p>
                <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-500">
                  תכונה זו תתווסף בקרוב — תוכלי להציג שאלה רק אם נבחרה תשובה מסוימת בשאלה קודמת.
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onRemove}
          disabled={isLocked}
          className="w-12 h-12 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 shrink-0"
          title={isLocked ? "שדה מוצמד — לא ניתן למחוק" : "מחק"}
          aria-label="מחק שאלה"
        >
          ✕
        </button>
      </div>
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
    onChange(options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
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
    <div className="bg-gray-50 border border-gray-200 rounded-md p-2 space-y-1.5">
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-gray-400 shrink-0 text-sm" aria-hidden="true">●</span>
          <input
            type="text"
            value={opt.label}
            onChange={(e) => update(i, { label: e.target.value, value: e.target.value })}
            className="flex-1 px-2.5 py-1.5 bg-white border border-gray-200 rounded-md text-sm min-h-[48px]"
            placeholder={`אפשרות ${i + 1}`}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            disabled={options.length <= 1}
            className="w-12 h-12 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30"
            aria-label="מחק אפשרות"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-xs font-semibold text-brand-sky hover:underline min-h-[48px] inline-flex items-center px-2 -mx-2"
      >
        + הוסף אפשרות
      </button>
    </div>
  );
}
