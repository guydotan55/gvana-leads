"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { clientConfig } from "@/client.config";
import type { Lead } from "@/lib/sheets";
import { classifyLead, type LeadTypeInfo } from "@/lib/lead-type";

interface LeadTableProps {
  leads: Lead[];
  onStatusChange: (lead: Lead, status: string, attempts?: number, plan?: string) => void;
  onHandledByChange: (lead: Lead, handledBy: string) => void;
  onCommentChange: (lead: Lead, comment: string) => void;
  onDelete: (lead: Lead) => Promise<void> | void;
  onOpenLead?: (lead: Lead, opts?: { focusSend?: boolean }) => void;
  pendingDeleteKey?: string | null;
}

function leadKey(l: Lead): string {
  return `${l.sheetTab}:${l.row}`;
}

const statusColorClasses: Record<string, string> = {
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  green: "bg-green-100 text-green-700 border-green-200",
  red: "bg-red-100 text-red-700 border-red-200",
  gray: "bg-gray-100 text-gray-700 border-gray-200",
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
};

function getStatusColor(statusKey: string): string {
  const status = clientConfig.statuses.find((s) => s.key === statusKey)
    || clientConfig.interviewStatuses.find((s) => s.key === statusKey);
  return statusColorClasses[status?.color || "gray"] || statusColorClasses.gray;
}

/* ---------- Lead Type Badge ---------- */

const LEAD_TYPE_STYLES: Record<LeadTypeInfo["kind"], { wrap: string; dot: string }> = {
  student: { wrap: "bg-indigo-50 text-indigo-700 ring-indigo-100", dot: "bg-indigo-500" },
  tech: { wrap: "bg-sky-50 text-sky-700 ring-sky-100", dot: "bg-sky-500" },
  masa: { wrap: "bg-orange-50 text-orange-700 ring-orange-100", dot: "bg-orange-500" },
  instructor: { wrap: "bg-amber-50 text-amber-800 ring-amber-100", dot: "bg-amber-500" },
  custom: { wrap: "bg-purple-50 text-purple-700 ring-purple-100", dot: "bg-purple-500" },
};

function LeadTypeBadge({ lead }: { lead: Lead }) {
  const info = classifyLead(lead);
  const style = LEAD_TYPE_STYLES[info.kind];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ring-1 text-[11px] font-semibold whitespace-nowrap max-w-[160px] ${style.wrap}`}
      title={info.label}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} aria-hidden />
      <span className="truncate">{info.label}</span>
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const isFacebook =
    source?.toLowerCase().includes("facebook") ||
    source?.toLowerCase().includes("fb");
  const isInstagram =
    source?.toLowerCase().includes("instagram") ||
    source?.toLowerCase().includes("ig");

  if (isFacebook) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600">
        {t("leads.source.facebook")}
      </span>
    );
  }
  if (isInstagram) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-pink-50 text-pink-600">
        {t("leads.source.instagram")}
      </span>
    );
  }
  return <span className="text-sm text-gray-500">{source || "—"}</span>;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    const date = new Date(iso);
    return date.toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/* ---------- Notes / Form Answers ---------- */

function parseNotes(notes: string): { label: string; value: string }[] {
  if (!notes?.trim()) return [];
  return notes
    .split("\n")
    .map((line) => {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) return null;
      const label = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (!label || !value) return null;
      return { label, value };
    })
    .filter(Boolean) as { label: string; value: string }[];
}

function NotesExpander({ notes }: { notes: string }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = parseNotes(notes);

  if (parsed.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 py-1.5 px-2 rounded-lg hover:bg-blue-50 transition-colors min-h-[32px]"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {expanded ? t("leads.hideAnswers") : t("leads.showAnswers")}
      </button>
      {expanded && (
        <div className="mt-2 space-y-2 animate-fadeIn">
          {parsed.map((item, i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-500 mb-1">{item.label}</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{item.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Handled By ---------- */

const HANDLED_BY_OPTIONS = ["נדב", "תמר"];

function HandledBySelect({
  lead,
  onChange,
}: {
  lead: Lead;
  onChange: (lead: Lead, handledBy: string) => void;
}) {
  const [isOther, setIsOther] = useState(
    lead.handledBy !== "" && !HANDLED_BY_OPTIONS.includes(lead.handledBy)
  );
  // Only focus the input when the user JUST clicked "Other" — never on
  // the initial render. Previously, pre-existing custom values caused
  // autoFocus to fire on every dashboard load, and the browser scrolls
  // focused elements into view → user lands mid-table instead of at
  // the top of the page.
  const [justToggled, setJustToggled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (justToggled && inputRef.current) {
      // preventScroll so even if this fires during a layout shift,
      // the browser doesn't auto-scroll the input into view.
      inputRef.current.focus({ preventScroll: true });
      setJustToggled(false);
    }
  }, [justToggled]);

  function handleSelect(value: string) {
    if (value === "__other__") {
      setIsOther(true);
      setJustToggled(true);
    } else {
      setIsOther(false);
      setJustToggled(false);
      onChange(lead, value);
    }
  }

  if (isOther) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          defaultValue={HANDLED_BY_OPTIONS.includes(lead.handledBy) ? "" : lead.handledBy}
          onBlur={(e) => {
            const val = e.target.value.trim();
            if (val) {
              onChange(lead, val);
            } else {
              setIsOther(false);
              onChange(lead, "");
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="px-2 py-1.5 rounded text-xs border border-gray-300 bg-white text-gray-700 w-20 focus:outline-none focus:ring-2 focus:ring-brand-sky/30"
          placeholder={t("leads.handledBy.other")}
        />
        <button
          onClick={() => {
            setIsOther(false);
            if (!HANDLED_BY_OPTIONS.includes(lead.handledBy)) {
              onChange(lead, "");
            }
          }}
          className="text-gray-400 hover:text-gray-600 text-xs p-1"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <select
      value={lead.handledBy || ""}
      onChange={(e) => handleSelect(e.target.value)}
      className="px-2 py-1.5 rounded text-xs border border-gray-200 bg-white text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-sky/30 min-h-[32px]"
    >
      <option value="">{t("leads.handledBy.select")}</option>
      {HANDLED_BY_OPTIONS.map((name) => (
        <option key={name} value={name}>{name}</option>
      ))}
      <option value="__other__">{t("leads.handledBy.other")}</option>
    </select>
  );
}

/* ---------- Plan Multi-Select ---------- */

const PLAN_OPTIONS = [
  { key: "short", label: t("leads.plan.short") },
  { key: "long", label: t("leads.plan.long") },
  { key: "tech", label: t("leads.plan.tech") },
];

function PlanMultiSelect({
  selectedPlans,
  onChange,
}: {
  selectedPlans: string;
  onChange: (plans: string) => void;
}) {
  const selected = selectedPlans ? selectedPlans.split(",") : [];

  function toggle(plan: string) {
    const newSelected = selected.includes(plan)
      ? selected.filter((p) => p !== plan)
      : [...selected, plan];
    onChange(newSelected.join(","));
  }

  return (
    <div className="flex flex-wrap gap-1">
      {PLAN_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          onClick={() => toggle(opt.key)}
          className={`px-2 py-1 rounded-full text-xs font-medium border transition-colors min-h-[28px] ${
            selected.includes(opt.key)
              ? "bg-blue-100 text-blue-700 border-blue-300"
              : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Status Select ---------- */

const INTERVIEW_STATUSES = ["under_review", "accepted", "rejected"];

function isInterviewStatus(status: string): boolean {
  return INTERVIEW_STATUSES.includes(status);
}

function getMainStatus(status: string): string {
  return isInterviewStatus(status) ? "relevant" : status;
}

function StatusSelect({
  lead,
  onStatusChange,
}: {
  lead: Lead;
  onStatusChange: (lead: Lead, status: string, attempts?: number, plan?: string) => void;
}) {
  const mainStatus = getMainStatus(lead.status);
  const isRelevant = mainStatus === "relevant";
  const interviewStatus = isInterviewStatus(lead.status) ? lead.status : "";

  function handleMainChange(newMain: string) {
    onStatusChange(lead, newMain);
  }

  function handleInterviewChange(value: string) {
    if (value === "") {
      onStatusChange(lead, "relevant");
    } else {
      onStatusChange(lead, value);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        value={mainStatus}
        onChange={(e) => handleMainChange(e.target.value)}
        className={`px-2 py-1.5 rounded-full text-xs font-medium border cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-sky/30 min-h-[32px] ${getStatusColor(mainStatus)}`}
      >
        {clientConfig.statuses.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      {lead.status === "unavailable" && (
        <div className="flex items-center gap-1 text-xs text-gray-500">
          {lead.attempts > 0 && (
            <button
              onClick={() =>
                onStatusChange(lead, "unavailable", lead.attempts - 1)
              }
              className="w-7 h-7 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 text-gray-600 font-bold text-sm"
              title="-1"
            >
              −
            </button>
          )}
          <span>{t("leads.attempts")}: {lead.attempts}</span>
          <button
            onClick={() => {
              const newAttempts = lead.attempts + 1;
              if (newAttempts >= 4) {
                onStatusChange(lead, "not_relevant", newAttempts);
              } else {
                onStatusChange(lead, "unavailable", newAttempts);
              }
            }}
            className="w-7 h-7 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 text-gray-600 font-bold text-sm"
            title="+1"
          >
            +
          </button>
        </div>
      )}
      {isRelevant && (
        <select
          value={interviewStatus}
          onChange={(e) => handleInterviewChange(e.target.value)}
          className={`px-2 py-1.5 rounded-full text-xs font-medium border cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-sky/30 min-h-[32px] ${interviewStatus ? getStatusColor(interviewStatus) : "bg-gray-50 text-gray-400 border-gray-200"}`}
        >
          <option value="">— {t("status.interviewed")}</option>
          {clientConfig.interviewStatuses.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      )}
      {(lead.status === "under_review" || lead.status === "accepted") && (
        <PlanMultiSelect
          selectedPlans={lead.plan || ""}
          onChange={(newPlan) => onStatusChange(lead, lead.status, undefined, newPlan)}
        />
      )}
    </div>
  );
}

/* ---------- Next Step Cell ----------
   UX prime directive #5: status changes show the next action. When a
   lead becomes "relevant", the dominant cell-CTA becomes "send first
   WhatsApp" (opens the drawer focused on the send section, since
   template selection is needed). "under_review" gets two-button pair
   (accept / reject). "accepted" shows a quiet badge. Other statuses
   render the standard StatusSelect. */

function NextStepCell({
  lead,
  onStatusChange,
  onOpenLead,
}: {
  lead: Lead;
  onStatusChange: (lead: Lead, status: string, attempts?: number, plan?: string) => void;
  onOpenLead?: (lead: Lead, opts?: { focusSend?: boolean }) => void;
}) {
  // "relevant" but NOT yet in interview pipeline → send first WhatsApp
  if (lead.status === "relevant") {
    return (
      <div className="flex flex-col items-stretch gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenLead?.(lead, { focusSend: true });
          }}
          className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg bg-brand-navy text-white text-xs font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
          {t("leads.nextStep.sendFirstWhatsApp")}
        </button>
        {/* Keep status pill compact below, so the admin can still
            re-route (e.g. mark "not_relevant" if they realized). */}
        <StatusSelect lead={lead} onStatusChange={onStatusChange} />
      </div>
    );
  }

  if (lead.status === "under_review") {
    return (
      <div className="flex flex-col items-stretch gap-1.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(lead, "accepted");
            }}
            className="flex-1 inline-flex items-center justify-center gap-1 min-h-[36px] px-2 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors whitespace-nowrap"
          >
            {t("leads.nextStep.markAccepted")}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(lead, "rejected");
            }}
            className="inline-flex items-center justify-center min-h-[36px] px-2 py-1.5 rounded-lg bg-white text-red-600 text-xs font-semibold border border-red-200 hover:bg-red-50 transition-colors whitespace-nowrap"
          >
            {t("leads.nextStep.markRejected")}
          </button>
        </div>
        {/* Plan multi-select stays here since this lead is in the
            interview pipeline and the admin may want to set the plan. */}
        <PlanMultiSelect
          selectedPlans={lead.plan || ""}
          onChange={(newPlan) => onStatusChange(lead, lead.status, undefined, newPlan)}
        />
      </div>
    );
  }

  if (lead.status === "accepted") {
    return (
      <div className="flex flex-col items-stretch gap-1.5">
        <span className="inline-flex items-center justify-center gap-1 min-h-[32px] px-2 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200 whitespace-nowrap">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {t("leads.nextStep.accepted")}
        </span>
        <PlanMultiSelect
          selectedPlans={lead.plan || ""}
          onChange={(newPlan) => onStatusChange(lead, lead.status, undefined, newPlan)}
        />
      </div>
    );
  }

  return <StatusSelect lead={lead} onStatusChange={onStatusChange} />;
}

/* ---------- Sorting ---------- */

type SortKey = "fullName" | "phone" | "createdTime" | "status" | "handledBy" | "platform";
type SortDir = "asc" | "desc";

function getSortValue(lead: Lead, key: SortKey): string | number {
  switch (key) {
    case "fullName": return lead.fullName?.toLowerCase() || "";
    case "phone": return lead.phone || "";
    case "createdTime": return lead.createdTime || "";
    case "status": return getMainStatus(lead.status);
    case "handledBy": return lead.handledBy || "";
    case "platform": return lead.platform?.toLowerCase() || "";
  }
}

function SortHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey | null;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = currentSort === sortKey;
  return (
    <th
      className="text-start px-3 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700 select-none whitespace-nowrap"
      onClick={() => onSort(sortKey)}
    >
      {label} {isActive ? (currentDir === "asc" ? "▲" : "▼") : ""}
    </th>
  );
}

/* ---------- Comment Editor ---------- */

function PencilIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function CommentEditor({
  lead,
  onChange,
}: {
  lead: Lead;
  onChange: (lead: Lead, comment: string) => void;
}) {
  const initial = lead.comment || "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Resync when lead changes (e.g., after server reconciliation)
  useEffect(() => {
    if (!editing) setDraft(initial);
  }, [initial, editing]);

  // Auto-size the textarea to its content
  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [draft, editing]);

  function enterEdit() {
    setDraft(initial);
    setEditing(true);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus({ preventScroll: true });
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
  }

  function commit() {
    const next = draft.trim();
    if (next !== initial.trim()) {
      onChange(lead, next);
    }
    setEditing(false);
  }

  function cancel() {
    setDraft(initial);
    setEditing(false);
  }

  function clear() {
    setDraft("");
    onChange(lead, "");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="relative rounded-lg border border-amber-200 bg-amber-50/70 shadow-sm overflow-hidden">
        <div className="absolute top-0 bottom-0 start-0 w-[3px] bg-gradient-to-b from-amber-300 to-amber-500" aria-hidden="true" />
        <div className="ps-3 pe-2 py-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <PencilIcon className="text-amber-600" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
              {t("leads.comment.label")}
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commit();
              }
            }}
            rows={2}
            placeholder={t("leads.comment.placeholder")}
            className="w-full resize-none bg-transparent text-sm text-amber-950 placeholder:text-amber-400 leading-relaxed focus:outline-none"
            style={{ fontFamily: "inherit" }}
          />
          <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-amber-200/70">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={commit}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 transition-colors"
              >
                {t("leads.comment.save")}
              </button>
              <button
                type="button"
                onClick={cancel}
                className="inline-flex items-center px-2 py-1 rounded-md text-xs text-amber-800/70 hover:text-amber-900 hover:bg-amber-100 transition-colors"
              >
                {t("leads.comment.cancel")}
              </button>
            </div>
            {initial && (
              <button
                type="button"
                onClick={clear}
                className="text-[11px] text-amber-700/60 hover:text-red-600 transition-colors"
                title={t("leads.comment.delete")}
              >
                {t("leads.comment.delete")}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (initial) {
    return (
      <button
        type="button"
        onClick={enterEdit}
        className="group w-full text-start relative rounded-lg border border-amber-200/80 bg-amber-50/60 hover:bg-amber-50 hover:border-amber-300 transition-colors overflow-hidden"
        title={t("leads.comment.edit")}
      >
        <div className="absolute top-0 bottom-0 start-0 w-[3px] bg-gradient-to-b from-amber-300 to-amber-500" aria-hidden="true" />
        <div className="ps-3 pe-2 py-1.5 flex items-start gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700/80 shrink-0 pt-0.5">
            {t("leads.comment.label")}
          </span>
          <p className="flex-1 text-sm text-amber-950 whitespace-pre-wrap break-words leading-snug">
            {initial}
          </p>
          <PencilIcon className="text-amber-500/70 group-hover:text-amber-700 transition-colors shrink-0 mt-0.5" />
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={enterEdit}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700/80 hover:text-amber-800 px-2 py-1 rounded-md hover:bg-amber-50 border border-dashed border-amber-300/60 hover:border-amber-400 transition-colors"
    >
      <PencilIcon />
      {t("leads.comment.add")}
    </button>
  );
}

/* ---------- Delete Row Action ----------
   No "Are you sure?" modal. Click = optimistic delete; the parent
   shows an UndoToast for 8s before committing the actual API call.
   This is the per the UX prime directive "forgiveness by default". */

function DeleteRowAction({
  lead,
  onDelete,
  variant = "icon",
}: {
  lead: Lead;
  onDelete: (lead: Lead) => Promise<void> | void;
  variant?: "icon" | "icon-sm";
}) {
  const sizeCls = variant === "icon-sm" ? "w-9 h-9" : "w-10 h-10";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onDelete(lead);
      }}
      title={t("leads.delete.button")}
      aria-label={t("leads.delete.button")}
      className={`group inline-flex items-center justify-center ${sizeCls} rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors`}
    >
      <TrashIcon size={14} />
    </button>
  );
}

function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/* ---------- Mobile Card ---------- */

function LeadCard({
  lead,
  onStatusChange,
  onHandledByChange,
  onCommentChange,
  onDelete,
  onOpenLead,
  pending,
}: {
  lead: Lead;
  onStatusChange: (lead: Lead, status: string, attempts?: number, plan?: string) => void;
  onHandledByChange: (lead: Lead, handledBy: string) => void;
  onCommentChange: (lead: Lead, comment: string) => void;
  onDelete: (lead: Lead) => Promise<void> | void;
  onOpenLead?: (lead: Lead, opts?: { focusSend?: boolean }) => void;
  pending?: boolean;
}) {
  function openDrawer() {
    if (!pending) onOpenLead?.(lead);
  }

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3 ${
        pending ? "opacity-50 line-through pointer-events-none" : ""
      }`}
      onClick={openDrawer}
      role={onOpenLead ? "button" : undefined}
      tabIndex={onOpenLead ? 0 : undefined}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onOpenLead) {
          e.preventDefault();
          openDrawer();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1">
            <LeadTypeBadge lead={lead} />
          </div>
          <p className="font-medium text-gray-900 text-sm truncate">{lead.fullName}</p>
          <p className="text-xs text-gray-500 font-mono mt-0.5" dir="ltr">{lead.phone}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <SourceBadge source={lead.platform} />
          <DeleteRowAction lead={lead} onDelete={onDelete} variant="icon-sm" />
        </div>
      </div>
      <div className="text-xs text-gray-400" dir="ltr">{formatDate(lead.createdTime)}</div>
      <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
        <NextStepCell lead={lead} onStatusChange={onStatusChange} onOpenLead={onOpenLead} />
      </div>
      <div className="pt-1 border-t border-gray-50" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs text-gray-400 mb-1">{t("leads.table.handledBy")}</p>
        <HandledBySelect lead={lead} onChange={onHandledByChange} />
      </div>
      <div className="pt-1 border-t border-gray-50" onClick={(e) => e.stopPropagation()}>
        <CommentEditor lead={lead} onChange={onCommentChange} />
      </div>
      {lead.notes && (
        <div className="pt-1 border-t border-gray-50" onClick={(e) => e.stopPropagation()}>
          <NotesExpander notes={lead.notes} />
        </div>
      )}
    </div>
  );
}

/* ---------- Desktop Lead Row ---------- */

function DesktopLeadRow({
  lead,
  onStatusChange,
  onHandledByChange,
  onCommentChange,
  onDelete,
  onOpenLead,
  pending,
}: {
  lead: Lead;
  onStatusChange: (lead: Lead, status: string, attempts?: number, plan?: string) => void;
  onHandledByChange: (lead: Lead, handledBy: string) => void;
  onCommentChange: (lead: Lead, comment: string) => void;
  onDelete: (lead: Lead) => Promise<void> | void;
  onOpenLead?: (lead: Lead, opts?: { focusSend?: boolean }) => void;
  pending?: boolean;
}) {
  function openDrawer(e: React.MouseEvent | React.KeyboardEvent) {
    if (pending) return;
    // The row is the "open drawer" target. Inline edit zones use a
    // stop-bubble wrapper (<NoOpenWrap>) so clicks there don't open
    // the drawer. Other clicks anywhere in the row do.
    const target = e.target as HTMLElement;
    if (target.closest("[data-no-open]")) return;
    onOpenLead?.(lead);
  }

  const rowCls = `border-b border-gray-50 transition-colors align-top ${
    pending
      ? "opacity-50 line-through pointer-events-none"
      : "hover:bg-blue-50/30 cursor-pointer"
  }`;

  return (
    <tr
      className={rowCls}
      onClick={openDrawer}
      role={onOpenLead ? "button" : undefined}
      tabIndex={onOpenLead && !pending ? 0 : undefined}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onOpenLead && !pending) {
          e.preventDefault();
          openDrawer(e);
        }
      }}
    >
      <td className="px-3 py-3 whitespace-nowrap">
        <LeadTypeBadge lead={lead} />
      </td>
      <td className="px-3 py-3">
        <span className="font-medium text-gray-900 text-sm">{lead.fullName}</span>
      </td>
      <td className="px-3 py-3">
        <span className="text-sm text-gray-600 font-mono" dir="ltr">
          {lead.phone}
        </span>
      </td>
      <td className="px-3 py-3">
        <span className="text-sm text-gray-500 whitespace-nowrap" dir="ltr">
          {formatDate(lead.createdTime)}
        </span>
      </td>
      <td className="px-3 py-3" data-no-open onClick={(e) => e.stopPropagation()}>
        <NextStepCell lead={lead} onStatusChange={onStatusChange} onOpenLead={onOpenLead} />
      </td>
      <td className="px-3 py-3" data-no-open onClick={(e) => e.stopPropagation()}>
        <HandledBySelect lead={lead} onChange={onHandledByChange} />
      </td>
      <td className="px-3 py-3">
        <SourceBadge source={lead.platform} />
      </td>
      <td
        className="px-3 py-3 min-w-[220px] max-w-[320px]"
        data-no-open
        onClick={(e) => e.stopPropagation()}
      >
        <CommentEditor lead={lead} onChange={onCommentChange} />
      </td>
      <td className="px-2 py-3 w-px whitespace-nowrap text-end" data-no-open onClick={(e) => e.stopPropagation()}>
        <DeleteRowAction lead={lead} onDelete={onDelete} />
      </td>
    </tr>
  );
}

/* ---------- Main Component ---------- */

export default function LeadTable({
  leads,
  onStatusChange,
  onHandledByChange,
  onCommentChange,
  onDelete,
  onOpenLead,
  pendingDeleteKey,
}: LeadTableProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedLeads = useMemo(() => {
    if (!sortKey) return leads;
    return [...leads].sort((a, b) => {
      const aVal = getSortValue(a, sortKey);
      const bVal = getSortValue(b, sortKey);
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [leads, sortKey, sortDir]);

  return (
    <div>
      {sortedLeads.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <p className="text-gray-400">{t("leads.table.empty")}</p>
        </div>
      ) : (
        <>
          {/* Mobile: Card layout */}
          <div className="md:hidden space-y-3">
            {sortedLeads.map((lead) => (
              <LeadCard
                key={leadKey(lead)}
                lead={lead}
                onStatusChange={onStatusChange}
                onHandledByChange={onHandledByChange}
                onCommentChange={onCommentChange}
                onDelete={onDelete}
                onOpenLead={onOpenLead}
                pending={pendingDeleteKey === leadKey(lead)}
              />
            ))}
          </div>

          {/* Desktop: Table layout */}
          <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-start px-3 py-3 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                      {t("leads.table.leadType")}
                    </th>
                    <SortHeader label={t("leads.table.name")} sortKey="fullName" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label={t("leads.table.phone")} sortKey="phone" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label={t("leads.table.date")} sortKey="createdTime" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label={t("leads.table.status")} sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label={t("leads.table.handledBy")} sortKey="handledBy" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label={t("leads.table.source")} sortKey="platform" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <th className="text-start px-3 py-3 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                      {t("leads.comment.label")}
                    </th>
                    <th className="px-2 py-3 w-px" aria-label={t("leads.table.actions")} />
                  </tr>
                </thead>
                <tbody>
                  {sortedLeads.map((lead) => (
                    <DesktopLeadRow
                      key={leadKey(lead)}
                      lead={lead}
                      onStatusChange={onStatusChange}
                      onHandledByChange={onHandledByChange}
                      onCommentChange={onCommentChange}
                      onDelete={onDelete}
                      onOpenLead={onOpenLead}
                      pending={pendingDeleteKey === leadKey(lead)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
