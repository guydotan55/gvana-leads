"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { FORMS, type FormConfig, type FormType } from "@/config/forms";
import type { Lead } from "@/lib/sheets";

const TECH_ADSET_ID = "120240874975730446";

/**
 * Mirrors DashboardClient.getLeadType so we can attribute leads to forms
 * without changing the source of truth.
 */
function getLeadType(lead: Lead): FormType {
  const name = lead.formName || "";
  const tab = lead.sheetTab || "";
  const combined = name + tab;
  if (combined.includes("מדריך") || combined.includes("מדריכ")) return "instructor";
  if (combined.includes("מסע משתחררים")) return "masa";
  const rawAdsetId = (lead.adsetId || "").replace(/^as:/, "");
  if (combined.includes("טכנולוגית") || rawAdsetId === TECH_ADSET_ID) return "tech";
  return "student";
}

/**
 * Canonical public origin used for shareable form URLs. Always returns the
 * production host, even when the dashboard is being viewed on a preview/PR
 * deployment or the legacy `-five` alias — those URLs are protected or
 * stale, and pasting them into ads would break form submission for users.
 *
 * Override at build time with NEXT_PUBLIC_PUBLIC_BASE_URL once a custom
 * domain is set up.
 */
function publicOrigin(): string {
  const envOverride = process.env.NEXT_PUBLIC_PUBLIC_BASE_URL;
  if (envOverride) return envOverride.replace(/\/$/, "");
  return "https://gvana-leads-dashboard.vercel.app";
}

function daysAgo(n: number): number {
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

interface FormStats {
  last30: number;
  last7: number;
  total: number;
  lastSubmissionAt: string | null;
}

function summarize(leads: Lead[], formType: FormType): FormStats {
  const t30 = daysAgo(30);
  const t7 = daysAgo(7);
  let last30 = 0;
  let last7 = 0;
  let total = 0;
  let latest: number | null = null;
  let latestIso: string | null = null;
  for (const lead of leads) {
    if (getLeadType(lead) !== formType) continue;
    total += 1;
    if (!lead.createdTime) continue;
    const ts = Date.parse(lead.createdTime);
    if (Number.isNaN(ts)) continue;
    if (ts >= t30) last30 += 1;
    if (ts >= t7) last7 += 1;
    if (latest === null || ts > latest) {
      latest = ts;
      latestIso = lead.createdTime;
    }
  }
  return { last30, last7, total, lastSubmissionAt: latestIso };
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "—";
  const diffMs = Date.now() - ts;
  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  const minute = 60 * 1000;
  if (diffMs < minute) return "לפני רגע";
  if (diffMs < hour) return `לפני ${Math.floor(diffMs / minute)} דקות`;
  if (diffMs < day) return `לפני ${Math.floor(diffMs / hour)} שעות`;
  if (diffMs < 7 * day) return `לפני ${Math.floor(diffMs / day)} ימים`;
  return new Date(ts).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

const ACCENT_CLASS: Record<FormConfig["accent"], { ring: string; bg: string; text: string; chip: string }> = {
  navy: {
    ring: "ring-blue-200/60",
    bg: "from-blue-50 to-white",
    text: "text-blue-700",
    chip: "bg-blue-100 text-blue-700",
  },
  sky: {
    ring: "ring-sky-200/60",
    bg: "from-sky-50 to-white",
    text: "text-sky-700",
    chip: "bg-sky-100 text-sky-700",
  },
  orange: {
    ring: "ring-orange-200/60",
    bg: "from-orange-50 to-white",
    text: "text-orange-700",
    chip: "bg-orange-100 text-orange-700",
  },
  amber: {
    ring: "ring-amber-200/60",
    bg: "from-amber-50 to-white",
    text: "text-amber-700",
    chip: "bg-amber-100 text-amber-700",
  },
};

function CopyButton({ text, label, ariaLabel }: { text: string; label: string; ariaLabel?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Older browsers / blocked clipboard — fallback prompt
      window.prompt(t("forms.copy.fallback"), text);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={ariaLabel || label}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all min-h-[34px] ${
        copied
          ? "bg-green-50 text-green-700 ring-1 ring-green-200"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      {copied ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {t("forms.copy.copied")}
        </>
      ) : (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className="relative inline-flex items-center justify-center w-2.5 h-2.5">
      <span
        className={`absolute inset-0 rounded-full ${
          active ? "bg-green-500" : "bg-gray-300"
        }`}
      />
      {active && (
        <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-60" />
      )}
    </span>
  );
}

interface FormCardProps {
  form: FormConfig;
  stats: FormStats;
  publicBase: string;
}

function FormCard({ form, stats, publicBase }: FormCardProps) {
  const [showUtm, setShowUtm] = useState(false);
  const [utmSource, setUtmSource] = useState("facebook");
  const [utmMedium, setUtmMedium] = useState("paid");
  const [utmCampaign, setUtmCampaign] = useState("");

  const accent = ACCENT_CLASS[form.accent];
  const baseUrl = `${publicBase}/form/${form.slug}`;
  const isActive = stats.last7 > 0;

  const utmUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (utmSource.trim()) params.set("utm_source", utmSource.trim());
    if (utmMedium.trim()) params.set("utm_medium", utmMedium.trim());
    if (utmCampaign.trim()) params.set("utm_campaign", utmCampaign.trim());
    const qs = params.toString();
    return qs ? `${baseUrl}?${qs}` : baseUrl;
  }, [baseUrl, utmSource, utmMedium, utmCampaign]);

  return (
    <article
      className={`relative bg-gradient-to-br ${accent.bg} rounded-2xl border border-gray-100 ring-1 ${accent.ring} p-5 sm:p-6 flex flex-col gap-4 shadow-sm transition-all hover:shadow-md`}
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <StatusDot active={isActive} />
            <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-400">
              /form/{form.slug}
            </span>
          </div>
          <h2 className={`text-lg font-bold ${accent.text} mb-1`}>{form.title}</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{form.subtitle}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${accent.chip}`}>
          {form.audience}
        </span>
      </header>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center bg-white/70 rounded-xl border border-gray-100 px-2 py-3">
        <div>
          <p className="text-[11px] text-gray-500 mb-0.5">{t("forms.stats.last7")}</p>
          <p className={`text-lg font-bold ${accent.text}`}>{stats.last7}</p>
        </div>
        <div className="border-x border-gray-100">
          <p className="text-[11px] text-gray-500 mb-0.5">{t("forms.stats.last30")}</p>
          <p className="text-lg font-bold text-gray-900">{stats.last30}</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-500 mb-0.5">{t("forms.stats.lastSubmission")}</p>
          <p className="text-xs font-medium text-gray-700 leading-tight pt-1">
            {formatRelative(stats.lastSubmissionAt)}
          </p>
        </div>
      </div>

      {/* Public URL */}
      <div>
        <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 mb-1.5">
          {t("forms.publicUrl")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code
            className="flex-1 min-w-0 truncate font-mono text-xs sm:text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2"
            dir="ltr"
            title={baseUrl}
          >
            {baseUrl}
          </code>
          <div className="flex items-center gap-1.5 shrink-0">
            <CopyButton text={baseUrl} label={t("forms.copy.url")} />
            <a
              href={baseUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("forms.openInNewTab")}
              title={t("forms.openInNewTab")}
              className="inline-flex items-center justify-center w-9 h-[34px] rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* UTM builder */}
      <div className="border-t border-gray-100 pt-3">
        <button
          type="button"
          onClick={() => setShowUtm((v) => !v)}
          className="flex items-center justify-between w-full text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
          aria-expanded={showUtm}
        >
          <span className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            {t("forms.utm.toggle")}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: showUtm ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {showUtm && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <UtmField label={t("forms.utm.source")} value={utmSource} onChange={setUtmSource} placeholder="facebook" />
              <UtmField label={t("forms.utm.medium")} value={utmMedium} onChange={setUtmMedium} placeholder="paid" />
              <UtmField label={t("forms.utm.campaign")} value={utmCampaign} onChange={setUtmCampaign} placeholder="technologi" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <code
                className="flex-1 min-w-0 truncate font-mono text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2"
                dir="ltr"
                title={utmUrl}
              >
                {utmUrl}
              </code>
              <CopyButton text={utmUrl} label={t("forms.copy.utmUrl")} />
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function UtmField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir="ltr"
        className="text-sm font-mono px-3 py-2 rounded-lg bg-white border border-gray-200 focus:border-brand-sky focus:ring-2 focus:ring-brand-sky/20 outline-none transition-colors min-h-[38px]"
      />
    </label>
  );
}

export default function FormsClient() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const origin = publicOrigin();

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/leads", {
        credentials: "same-origin",
        redirect: "manual",
        headers: { Accept: "application/json" },
      });
      if (res.type === "opaqueredirect" || res.status === 0 || (res.status >= 300 && res.status < 400)) {
        throw new Error(`Auth redirect (${res.status}) — session may have expired, please reload`);
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}`);
      }
      const data = await res.json();
      setLeads(data.leads || []);
      setError("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("common.error");
      setError(`${t("common.error")} — ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const totals = useMemo(() => {
    const last30 = leads.filter((l) => {
      if (!l.createdTime) return false;
      const ts = Date.parse(l.createdTime);
      return !Number.isNaN(ts) && ts >= daysAgo(30);
    }).length;
    return { total: leads.length, last30, formCount: FORMS.length };
  }, [leads]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">{t("forms.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("forms.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <SummaryStat label={t("forms.summary.forms")} value={totals.formCount} />
          <SummaryStat label={t("forms.summary.last30")} value={loading ? "…" : totals.last30} />
        </div>
      </header>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {FORMS.map((form) => (
          <FormCard
            key={form.slug}
            form={form}
            stats={loading ? { last7: 0, last30: 0, total: 0, lastSubmissionAt: null } : summarize(leads, form.leadType)}
            publicBase={origin}
          />
        ))}
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-sm">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900 leading-tight">{value}</p>
    </div>
  );
}
