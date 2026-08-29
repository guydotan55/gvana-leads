"use client";

import { useState } from "react";
import type { FieldType } from "@/config/forms";

const ALL_TYPES: { type: FieldType; label: string; icon: string }[] = [
  { type: "text", label: "טקסט", icon: "Aa" },
  { type: "phone", label: "טלפון", icon: "☏" },
  { type: "radio", label: "רשימה", icon: "◉" },
  { type: "date", label: "תאריך", icon: "📅" },
  { type: "email", label: "אימייל", icon: "@" },
  { type: "number", label: "מספר", icon: "123" },
  { type: "textarea", label: "טקסט ארוך", icon: "¶" },
  { type: "checkbox", label: "בחירה מרובה", icon: "☑" },
];

/**
 * Progressive-disclosure picker. Shows the 4 common types first; the rest
 * unfold behind "עוד..." so a non-tech-savvy admin isn't faced with 8
 * abstract options at once.
 */
export default function FieldTypePicker({
  onPick,
  onCancel,
}: {
  onPick: (type: FieldType) => void;
  onCancel: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? ALL_TYPES : ALL_TYPES.slice(0, 4);
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">איזה סוג שאלה?</p>
        <button
          type="button"
          onClick={onCancel}
          className="w-12 h-12 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          aria-label="סגור"
        >
          ✕
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {visible.map(({ type, label, icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => onPick(type)}
            className="flex items-center gap-2 px-3 py-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-800 bg-white hover:bg-gray-50 hover:border-gray-300 text-start min-h-[48px] transition-colors"
          >
            <span className="w-8 h-8 rounded-md bg-gray-100 text-gray-700 font-mono text-xs flex items-center justify-center shrink-0">
              {icon}
            </span>
            {label}
          </button>
        ))}
      </div>
      {!showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full text-xs font-semibold text-brand-sky hover:underline py-1.5 min-h-[48px] inline-flex items-center justify-center"
        >
          עוד אפשרויות…
        </button>
      )}
    </div>
  );
}
