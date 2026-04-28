"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { FORMS, type FormConfig, type FormDef } from "@/config/forms";

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

type Range = "7d" | "30d";

interface FormStat {
  views7d: number;
  views30d: number;
  subs7d: number;
  subs30d: number;
  lastSubmissionAt: string | null;
}

function pickRange(stat: FormStat | undefined, range: Range): { views: number; subs: number } {
  if (!stat) return { views: 0, subs: 0 };
  return range === "7d"
    ? { views: stat.views7d, subs: stat.subs7d }
    : { views: stat.views30d, subs: stat.subs30d };
}

function formatConversion(views: number, subs: number): string {
  if (views === 0) return "—";
  const pct = (subs / views) * 100;
  return `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
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
  stat: FormStat | undefined;
  range: Range;
  publicBase: string;
}

function FormCard({ form, stat, range, publicBase }: FormCardProps) {
  const [showUtm, setShowUtm] = useState(false);
  const [utmSource, setUtmSource] = useState("facebook");
  const [utmMedium, setUtmMedium] = useState("paid");
  const [utmCampaign, setUtmCampaign] = useState("");

  const accent = ACCENT_CLASS[form.accent];
  const baseUrl = `${publicBase}/form/${form.slug}`;
  const { views, subs } = pickRange(stat, range);
  const isActive = (stat?.subs7d || 0) > 0 || (stat?.views7d || 0) > 0;

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
          <p className="text-[11px] text-gray-500 mb-0.5">{t("forms.metrics.views")}</p>
          <p className="text-lg font-bold text-gray-900">{views}</p>
        </div>
        <div className="border-x border-gray-100">
          <p className="text-[11px] text-gray-500 mb-0.5">{t("forms.metrics.submissions")}</p>
          <p className={`text-lg font-bold ${accent.text}`}>{subs}</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-500 mb-0.5">{t("forms.metrics.conversion")}</p>
          <p className="text-lg font-bold text-gray-900">{formatConversion(views, subs)}</p>
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

      {/* Clone action */}
      <div className="border-t border-gray-100 pt-3">
        <Link
          href={`/forms/new?clone=${form.slug}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          שכפל לטופס חדש
        </Link>
      </div>
    </article>
  );
}

/* ---------- Builder form card (user-created) ---------- */

function BuilderFormCard({
  def,
  stat,
  range,
  publicBase,
  onDelete,
}: {
  def: FormDef;
  stat: FormStat | undefined;
  range: Range;
  publicBase: string;
  onDelete: (def: FormDef) => Promise<void> | void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const baseUrl = `${publicBase}/form/${def.id}`;
  const isPublished = def.status === "published";
  const { views, subs } = pickRange(stat, range);

  async function handleDelete() {
    setBusy(true);
    try {
      await onDelete(def);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <article className="relative bg-white rounded-2xl border border-gray-100 ring-1 ring-gray-100 p-5 sm:p-6 flex flex-col gap-4 shadow-sm transition-all hover:shadow-md">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
              isPublished ? "bg-green-50 text-green-700 ring-1 ring-green-200" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
            }`}>
              {isPublished ? "פורסם" : "טיוטה"}
            </span>
            <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-400">
              /form/{def.id}
            </span>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">{def.title}</h2>
          {def.subtitle && <p className="text-sm text-gray-600 leading-relaxed">{def.subtitle}</p>}
        </div>
        <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600">
          {def.fields.length} שאלות
        </span>
      </header>

      {isPublished && (
        <div className="grid grid-cols-3 gap-2 text-center bg-gray-50 rounded-xl border border-gray-100 px-2 py-3">
          <div>
            <p className="text-[11px] text-gray-500 mb-0.5">{t("forms.metrics.views")}</p>
            <p className="text-lg font-bold text-gray-900">{views}</p>
          </div>
          <div className="border-x border-gray-100">
            <p className="text-[11px] text-gray-500 mb-0.5">{t("forms.metrics.submissions")}</p>
            <p className="text-lg font-bold text-purple-700">{subs}</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500 mb-0.5">{t("forms.metrics.conversion")}</p>
            <p className="text-lg font-bold text-gray-900">{formatConversion(views, subs)}</p>
          </div>
        </div>
      )}

      {isPublished && (
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 mb-1.5">
            {t("forms.publicUrl")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code
              className="flex-1 min-w-0 truncate font-mono text-xs sm:text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
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
      )}

      <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
        <Link
          href={`/forms/${def.id}/edit`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-navy text-white hover:opacity-90 transition-opacity"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          ערוך
        </Link>
        {confirming ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-red-700 font-semibold">למחוק את הטופס?</span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="px-2.5 py-1 rounded-md text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "..." : "מחק"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="px-2.5 py-1 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              ביטול
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
            מחק
          </button>
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

interface OrphanTab {
  title: string;
  sheetId: number;
  dataRows: number;
}

export default function FormsClient() {
  const [stats, setStats] = useState<Record<string, FormStat>>({});
  const [builderForms, setBuilderForms] = useState<FormDef[]>([]);
  const [orphans, setOrphans] = useState<OrphanTab[]>([]);
  const [reconciling, setReconciling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState<Range>("30d");
  const origin = publicOrigin();

  const fetchBuilderForms = useCallback(async () => {
    try {
      const res = await fetch("/api/forms", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      setBuilderForms(data.forms || []);
    } catch {
      // non-fatal
    }
  }, []);

  const fetchOrphans = useCallback(async () => {
    try {
      const res = await fetch("/api/forms/reconcile", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      setOrphans(data.orphans || []);
    } catch {
      // non-fatal
    }
  }, []);

  const handleDeleteForm = useCallback(async (def: FormDef) => {
    const res = await fetch(`/api/forms/${def.id}`, { method: "DELETE" });
    if (res.ok) {
      setBuilderForms((prev) => prev.filter((f) => f.id !== def.id));
      fetchOrphans();
    }
  }, [fetchOrphans]);

  const reconcileTitles = useCallback(async (titles?: string[]): Promise<void> => {
    if (reconciling) return;
    setReconciling(true);
    try {
      const res = await fetch("/api/forms/reconcile", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(titles ? { titles } : {}),
      });
      if (!res.ok) throw new Error("reconcile failed");
      const data = await res.json();
      const cleared = new Set<string>([
        ...(data.deleted || []),
        ...(((data.archived || []) as { from: string }[]).map((a) => a.from)),
      ]);
      setOrphans((prev) => prev.filter((o) => !cleared.has(o.title)));
      const numDel = data.deleted?.length || 0;
      const numArc = data.archived?.length || 0;
      const action =
        numDel && numArc ? `נמחקו ${numDel}, אורכבו ${numArc}` :
        numDel ? `נמחקו ${numDel}` :
        numArc ? `אורכבו ${numArc}` :
        "לא בוצעו פעולות";
      window.alert(`✅ ${action}`);
    } catch {
      window.alert("שגיאה בניקוי, נסה שוב");
    } finally {
      setReconciling(false);
    }
  }, [reconciling]);

  const handleReconcileAll = useCallback(async () => {
    if (orphans.length === 0) return;
    const empty = orphans.filter((o) => o.dataRows === 0).length;
    const withData = orphans.length - empty;
    const message =
      `לנקות את כל ${orphans.length} הטפסים היתומים?\n\n` +
      `• ${empty} ימחקו לגמרי (ריקים)\n` +
      `• ${withData} יועברו לארכיון (יש בהם הגשות — יוסתרו אבל יישמרו)`;
    if (!window.confirm(message)) return;
    await reconcileTitles();
  }, [orphans, reconcileTitles]);

  const handleReconcileOne = useCallback(async (orphan: OrphanTab) => {
    const action = orphan.dataRows === 0
      ? `הטופס "${orphan.title}" ריק וימחק לגמרי.`
      : `הטופס "${orphan.title}" מכיל ${orphan.dataRows} הגשות. הוא יועבר לארכיון (יוסתר מהדאשבורד, אבל הנתונים יישמרו בגיליון).`;
    if (!window.confirm(`${action}\n\nלהמשיך?`)) return;
    await reconcileTitles([orphan.title]);
  }, [reconcileTitles]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/form-stats", {
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
      setStats(data.stats || {});
      setError("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("common.error");
      setError(`${t("common.error")} — ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchBuilderForms();
    fetchOrphans();
  }, [fetchStats, fetchBuilderForms, fetchOrphans]);

  const totals = useMemo(() => {
    let totalSubs = 0;
    for (const slug of Object.keys(stats)) {
      totalSubs += range === "7d" ? stats[slug].subs7d : stats[slug].subs30d;
    }
    return { totalSubs, formCount: FORMS.length + builderForms.length };
  }, [stats, builderForms, range]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">{t("forms.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("forms.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <RangeToggle range={range} onChange={setRange} />
          <SummaryStat label={t("forms.summary.forms")} value={totals.formCount} />
          <SummaryStat
            label={range === "7d" ? `${t("forms.metrics.submissions")} · ${t("forms.range.7d")}` : `${t("forms.metrics.submissions")} · ${t("forms.range.30d")}`}
            value={loading ? "…" : totals.totalSubs}
          />
          <Link
            href="/forms/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white text-sm font-bold shadow-md hover:shadow-lg transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            צור טופס חדש
          </Link>
        </div>
      </header>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {orphans.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900">
                נמצאו {orphans.length} טאבים בגיליון שלא קשורים לטפסים פעילים
              </p>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                ככל הנראה נשארו מטפסים שנמחקו. ניתן לנקות כל אחד בנפרד או את כולם בבת אחת.
                <br />
                <span className="text-amber-600">טאב ריק יימחק לגמרי. טאב עם הגשות יוסתר מהדאשבורד אך הנתונים יישמרו בגיליון.</span>
              </p>
            </div>
            <button
              type="button"
              onClick={handleReconcileAll}
              disabled={reconciling}
              className="shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-800 text-xs font-semibold hover:bg-amber-100 disabled:opacity-50 transition-colors"
            >
              נקה הכל ({orphans.length})
            </button>
          </div>
          <ul className="divide-y divide-amber-200/70 bg-white/60 border border-amber-200 rounded-lg overflow-hidden">
            {orphans.map((o) => {
              const isEmpty = o.dataRows === 0;
              return (
                <li key={o.title} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      isEmpty
                        ? "bg-gray-100 text-gray-700"
                        : "bg-amber-100 text-amber-800"
                    }`}>
                      {isEmpty ? "ריק" : `${o.dataRows} הגשות`}
                    </span>
                    <code className="font-mono text-xs sm:text-sm text-gray-800 truncate" dir="ltr" title={o.title}>{o.title}</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleReconcileOne(o)}
                    disabled={reconciling}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors disabled:opacity-50 ${
                      isEmpty
                        ? "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                        : "bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300"
                    }`}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                    {isEmpty ? "מחק" : "ארכוב"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {builderForms.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            הטפסים שיצרת
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            {builderForms.map((def) => (
              <BuilderFormCard
                key={def.id}
                def={def}
                stat={stats[def.id]}
                range={range}
                publicBase={origin}
                onDelete={handleDeleteForm}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        {builderForms.length > 0 && (
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            טפסי הליבה
          </h2>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          {FORMS.map((form) => (
            <FormCard
              key={form.slug}
              form={form}
              stat={stats[form.slug]}
              range={range}
              publicBase={origin}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function RangeToggle({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  return (
    <div className="inline-flex items-center bg-white border border-gray-200 rounded-lg p-0.5 shadow-sm">
      {(["7d", "30d"] as const).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
            range === r ? "bg-brand-navy text-white shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          {r === "7d" ? t("forms.range.7d") : t("forms.range.30d")}
        </button>
      ))}
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
