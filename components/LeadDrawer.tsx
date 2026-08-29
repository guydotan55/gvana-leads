"use client";

/**
 * LeadDrawer — right-side slide-in panel (start-side in RTL) for
 * editing a single lead. Replaces inline expansion + modal navigation.
 *
 * Behavior contract:
 * - Overlays the table at ~480px wide on desktop, full-width on mobile.
 * - The table stays visible behind it (no full backdrop block) — the
 *   admin needs surrounding rows for campaign context. We use a thin
 *   click-catcher behind the drawer to close on outside click.
 * - Inline autosave for every editable field (no Save button). Each
 *   field calls the same handlers used by the inline row edits, so
 *   the optimistic-update logic in DashboardClient stays in one place.
 * - Comment + handled-by are debounced (600ms) to avoid hammering the
 *   Sheets API on every keystroke / option toggle.
 * - ESC and click-outside close. 200ms ease-out CSS transition.
 *
 * Note: This component intentionally does NOT own the lead state. It
 * re-renders against whatever lead the parent passes in, so the parent's
 * polling / optimistic updates stay authoritative.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { clientConfig } from "@/client.config";
import type { Lead } from "@/lib/sheets";
import { classifyLead } from "@/lib/lead-type";

export interface Template {
  name: string;
  language: string;
}

interface LeadDrawerProps {
  lead: Lead | null;
  open: boolean;
  focusSend?: boolean;
  /**
   * Optional pre-fetched template list. When provided, the drawer
   * skips its own `/api/templates/mappings` fetch — handy when many
   * drawers open per session (parent hoists the fetch once). When
   * `null`, the drawer treats it as still-loading. When `undefined`,
   * the drawer falls back to fetching itself.
   */
  templates?: Template[] | null;
  onClose: () => void;
  onStatusChange: (lead: Lead, status: string, attempts?: number, plan?: string) => void;
  onHandledByChange: (lead: Lead, handledBy: string) => void;
  onCommentChange: (lead: Lead, comment: string) => void;
}

const INTERVIEW_STATUSES = ["under_review", "accepted", "rejected"];
const PLAN_OPTIONS = [
  { key: "short", labelKey: "leads.plan.short" as const },
  { key: "long", labelKey: "leads.plan.long" as const },
  { key: "tech", labelKey: "leads.plan.tech" as const },
];

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("he-IL", {
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

export default function LeadDrawer({
  lead,
  open,
  focusSend,
  templates: templatesProp,
  onClose,
  onStatusChange,
  onHandledByChange,
  onCommentChange,
}: LeadDrawerProps) {
  // Track which lead is currently rendered so we can keep the
  // outgoing animation when `lead` becomes null on close.
  const [renderLead, setRenderLead] = useState<Lead | null>(lead);
  const sendSectionRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (lead) setRenderLead(lead);
  }, [lead]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Scroll send section into focus when requested
  useEffect(() => {
    if (open && focusSend && sendSectionRef.current) {
      requestAnimationFrame(() => {
        sendSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [open, focusSend, renderLead?.row]);

  // Intentionally NOT locking body scroll: the drawer's contract is
  // "table stays visible behind for campaign context". Locking body
  // overflow would defeat that — admins need to scroll the table while
  // a lead is open to compare against neighboring rows. The click-catcher
  // overlay (`bg-black/20`) already handles outside-click-to-close.

  if (!renderLead) return null;

  return (
    <>
      {/* Click-catcher — transparent so the table behind stays visible.
          A subtle tint helps focus without hiding context. */}
      <div
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("leads.drawer.title")}
        className={`fixed inset-y-0 start-0 z-50 w-full md:w-[480px] bg-white shadow-2xl border-e border-gray-100 flex flex-col transform transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "rtl:translate-x-full ltr:-translate-x-full"
        }`}
        style={{ height: "100dvh" }}
      >
        <DrawerHeader lead={renderLead} onClose={onClose} />
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <DrawerStatus
            lead={renderLead}
            onStatusChange={onStatusChange}
          />
          <DrawerHandledBy
            lead={renderLead}
            onHandledByChange={onHandledByChange}
          />
          <DrawerComment
            lead={renderLead}
            onCommentChange={onCommentChange}
          />
          <div ref={sendSectionRef}>
            <DrawerSend lead={renderLead} templatesProp={templatesProp} />
          </div>
          <DrawerDetails lead={renderLead} />
        </div>
      </aside>
    </>
  );
}

/* ---------- Header ---------- */

function DrawerHeader({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const info = classifyLead(lead);
  return (
    <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
          {info.label}
        </p>
        <h2 className="text-lg font-semibold text-gray-900 truncate">
          {lead.fullName || "—"}
        </h2>
        <p className="text-sm text-gray-500 font-mono mt-0.5" dir="ltr">
          {lead.phone}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("leads.drawer.close")}
        className="inline-flex items-center justify-center w-12 h-12 -m-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </header>
  );
}

/* ---------- Sections ---------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
      {children}
    </p>
  );
}

function DrawerStatus({
  lead,
  onStatusChange,
}: {
  lead: Lead;
  onStatusChange: (lead: Lead, status: string, attempts?: number, plan?: string) => void;
}) {
  const isInterview = INTERVIEW_STATUSES.includes(lead.status);
  const mainStatus = isInterview ? "relevant" : lead.status;
  const interviewStatus = isInterview ? lead.status : "";
  const selectedPlans = lead.plan ? lead.plan.split(",") : [];

  function togglePlan(plan: string) {
    const next = selectedPlans.includes(plan)
      ? selectedPlans.filter((p) => p !== plan)
      : [...selectedPlans, plan];
    onStatusChange(lead, lead.status, undefined, next.join(","));
  }

  return (
    <section>
      <SectionLabel>{t("leads.drawer.section.status")}</SectionLabel>
      <div className="space-y-3">
        <select
          value={mainStatus}
          onChange={(e) => onStatusChange(lead, e.target.value)}
          className="w-full min-h-[48px] px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-sky/30 focus:border-brand-sky"
        >
          {clientConfig.statuses.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>

        {lead.status === "unavailable" && (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <button
              type="button"
              onClick={() => onStatusChange(lead, "unavailable", Math.max(0, lead.attempts - 1))}
              disabled={lead.attempts <= 0}
              className="w-12 h-12 inline-flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 text-lg font-bold"
              aria-label="-1"
            >
              −
            </button>
            <span className="flex-1 text-center">
              {t("leads.attempts")}: <strong className="text-gray-900">{lead.attempts}</strong>
            </span>
            <button
              type="button"
              onClick={() => {
                const next = lead.attempts + 1;
                if (next >= 4) onStatusChange(lead, "not_relevant", next);
                else onStatusChange(lead, "unavailable", next);
              }}
              className="w-12 h-12 inline-flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-lg font-bold"
              aria-label="+1"
            >
              +
            </button>
          </div>
        )}

        {(mainStatus === "relevant" || isInterview) && (
          <select
            value={interviewStatus}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") onStatusChange(lead, "relevant");
              else onStatusChange(lead, v);
            }}
            className="w-full min-h-[48px] px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-sky/30 focus:border-brand-sky"
          >
            <option value="">— {t("status.interviewed")}</option>
            {clientConfig.interviewStatuses.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        )}

        {(lead.status === "under_review" || lead.status === "accepted") && (
          <div>
            <p className="text-xs text-gray-500 mb-1.5">{t("leads.plan")}</p>
            <div className="flex flex-wrap gap-2">
              {PLAN_OPTIONS.map((opt) => {
                const active = selectedPlans.includes(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => togglePlan(opt.key)}
                    className={`min-h-[48px] px-3 py-2 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? "bg-blue-100 text-blue-700 border-blue-300"
                        : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    {t(opt.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function DrawerHandledBy({
  lead,
  onHandledByChange,
}: {
  lead: Lead;
  onHandledByChange: (lead: Lead, handledBy: string) => void;
}) {
  const handlers = clientConfig.handlers;
  const inPreset = handlers.includes(lead.handledBy);
  const [isOther, setIsOther] = useState(!!lead.handledBy && !inPreset);
  const [draft, setDraft] = useState(inPreset ? "" : lead.handledBy);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Resync if the lead row got reloaded with a different value
    if (handlers.includes(lead.handledBy)) {
      setIsOther(false);
      setDraft("");
    } else if (lead.handledBy) {
      setIsOther(true);
      setDraft(lead.handledBy);
    }
  }, [lead.handledBy, handlers]);

  function commitOther(value: string) {
    const trimmed = value.trim();
    if (trimmed === lead.handledBy) return;
    onHandledByChange(lead, trimmed);
  }

  function handleOtherChange(value: string) {
    setDraft(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => commitOther(value), 600);
  }

  return (
    <section>
      <SectionLabel>{t("leads.drawer.section.handler")}</SectionLabel>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setIsOther(false);
            setDraft("");
            onHandledByChange(lead, "");
          }}
          className={`min-h-[48px] px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            !lead.handledBy
              ? "bg-gray-200 text-gray-800 border-gray-300"
              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
          }`}
        >
          {t("leads.handledBy.select")}
        </button>
        {handlers.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => {
              setIsOther(false);
              setDraft("");
              onHandledByChange(lead, name);
            }}
            className={`min-h-[48px] px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              lead.handledBy === name
                ? "bg-blue-100 text-blue-700 border-blue-300"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setIsOther(true)}
          className={`min-h-[48px] px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            isOther
              ? "bg-blue-100 text-blue-700 border-blue-300"
              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
          }`}
        >
          {t("leads.handledBy.other")}
        </button>
      </div>
      {isOther && (
        <input
          type="text"
          value={draft}
          onChange={(e) => handleOtherChange(e.target.value)}
          onBlur={() => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            commitOther(draft);
          }}
          placeholder={t("leads.handledBy.other")}
          className="mt-2 w-full min-h-[48px] px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-sky/30 focus:border-brand-sky"
        />
      )}
    </section>
  );
}

function DrawerComment({
  lead,
  onCommentChange,
}: {
  lead: Lead;
  onCommentChange: (lead: Lead, comment: string) => void;
}) {
  const [draft, setDraft] = useState(lead.comment || "");
  const [savedFlash, setSavedFlash] = useState(false);
  const initialRef = useRef(lead.comment || "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resync when the row swaps (drawer navigates to a different lead)
  useEffect(() => {
    setDraft(lead.comment || "");
    initialRef.current = lead.comment || "";
  }, [lead.row, lead.sheetTab, lead.comment]);

  function scheduleCommit(next: string) {
    setDraft(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (next.trim() !== (initialRef.current || "").trim()) {
        onCommentChange(lead, next.trim());
        initialRef.current = next.trim();
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1200);
      }
    }, 600);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <SectionLabel>{t("leads.drawer.section.comment")}</SectionLabel>
        {savedFlash && (
          <span className="text-[11px] text-green-600 font-medium">
            {t("leads.drawer.savedHint")}
          </span>
        )}
      </div>
      <textarea
        value={draft}
        onChange={(e) => scheduleCommit(e.target.value)}
        placeholder={t("leads.comment.placeholder")}
        rows={3}
        className="w-full min-h-[96px] px-3 py-2 rounded-lg border border-amber-200 bg-amber-50/40 text-sm text-amber-950 placeholder:text-amber-400 leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300 resize-y"
      />
    </section>
  );
}

function DrawerSend({
  lead,
  templatesProp,
}: {
  lead: Lead;
  templatesProp?: Template[] | null;
}) {
  // When the parent hoists the fetch (DashboardClient does), we just
  // mirror its value. Otherwise, fall back to a self-contained fetch
  // so the drawer remains drop-in usable from other contexts.
  const usingProp = templatesProp !== undefined;
  const [localTemplates, setLocalTemplates] = useState<Template[] | null>(null);
  const templates = usingProp ? templatesProp ?? null : localTemplates;
  const [picked, setPicked] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    if (usingProp) return;
    let cancelled = false;
    // Templates are derived from configured mappings (the only ones we
    // know how to fill in). If none, surface a link to the manager.
    (async () => {
      try {
        const res = await fetch("/api/templates/mappings", {
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list: Template[] = Object.entries(data.mappings || {}).map(
          ([name, m]) => ({ name, language: (m as { language: string }).language || "he" })
        );
        if (!cancelled) setLocalTemplates(list);
      } catch (err) {
        console.error("Failed to load template mappings:", err);
        if (!cancelled) setLocalTemplates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [usingProp]);

  async function handleSend() {
    if (!picked || sending) return;
    setSending(true);
    setFeedback(null);
    try {
      const tpl = templates?.find((tt) => tt.name === picked);
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadRow: lead.row,
          templateName: picked,
          language: tpl?.language || "he",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      setFeedback({ kind: "success", msg: t("leads.drawer.send.success") });
    } catch (err) {
      console.error("Send message failed:", err);
      setFeedback({ kind: "error", msg: t("leads.drawer.send.error") });
    } finally {
      setSending(false);
    }
  }

  return (
    <section>
      <SectionLabel>{t("leads.drawer.section.send")}</SectionLabel>
      {templates === null ? (
        <p className="text-sm text-gray-400">{t("common.loading")}</p>
      ) : templates.length === 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 border border-gray-200 p-3">
          <p className="text-sm text-gray-600">{t("leads.drawer.send.noTemplates")}</p>
          <a
            href="/templates"
            className="shrink-0 inline-flex items-center justify-center min-h-[40px] px-3 py-2 rounded-lg bg-brand-navy text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {t("leads.drawer.send.openTemplates")}
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            className="w-full min-h-[48px] px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-sky/30 focus:border-brand-sky"
          >
            <option value="">{t("leads.drawer.send.template")}</option>
            {templates.map((tpl) => (
              <option key={tpl.name} value={tpl.name}>
                {tpl.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleSend}
            disabled={!picked || sending}
            className="inline-flex items-center justify-center min-h-[48px] px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {sending ? t("leads.drawer.send.sending") : t("leads.drawer.send.send")}
          </button>
          {feedback && (
            <p
              className={`text-sm ${
                feedback.kind === "success" ? "text-green-600" : "text-red-600"
              }`}
            >
              {feedback.msg}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function DrawerDetails({ lead }: { lead: Lead }) {
  const rows = useMemo(
    () =>
      [
        { label: t("leads.drawer.field.createdTime"), value: formatDate(lead.createdTime) },
        { label: t("leads.drawer.field.platform"), value: lead.platform },
        { label: t("leads.drawer.field.formName"), value: lead.formName },
        { label: t("leads.drawer.field.campaignName"), value: lead.campaignName },
        { label: t("leads.drawer.field.adsetName"), value: lead.adsetName },
        { label: t("leads.drawer.field.adName"), value: lead.adName },
        { label: t("leads.drawer.field.interest"), value: lead.interest },
        { label: t("leads.drawer.field.lastMessage"), value: lead.lastMessage },
        {
          label: t("leads.drawer.field.lastMessageDate"),
          value: lead.lastMessageDate ? formatDate(lead.lastMessageDate) : "",
        },
        { label: t("leads.drawer.field.leadId"), value: lead.leadId },
      ].filter((r) => r.value && String(r.value).trim() !== ""),
    [lead]
  );

  // Form answers (notes column) parsed as label: value pairs
  const notes = useMemo(() => {
    if (!lead.notes?.trim()) return [] as { label: string; value: string }[];
    return lead.notes
      .split("\n")
      .map((line) => {
        const i = line.indexOf(":");
        if (i === -1) return null;
        const label = line.slice(0, i).trim();
        const value = line.slice(i + 1).trim();
        if (!label || !value) return null;
        return { label, value };
      })
      .filter(Boolean) as { label: string; value: string }[];
  }, [lead.notes]);

  return (
    <>
      <section>
        <SectionLabel>{t("leads.drawer.section.details")}</SectionLabel>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400">—</p>
        ) : (
          <dl className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-gray-50/40">
            {rows.map((r) => (
              <div key={r.label} className="flex gap-3 px-3 py-2">
                <dt className="text-xs text-gray-500 w-1/3 shrink-0 mt-0.5">{r.label}</dt>
                <dd className="text-sm text-gray-800 flex-1 break-words" dir="auto">
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
      {notes.length > 0 && (
        <section>
          <SectionLabel>{t("leads.showAnswers")}</SectionLabel>
          <div className="space-y-2">
            {notes.map((n, i) => (
              <div key={i} className="rounded-lg border border-gray-100 bg-white p-3">
                <p className="text-[11px] font-semibold text-gray-500 mb-1">{n.label}</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {n.value}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
