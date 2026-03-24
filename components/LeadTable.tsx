"use client";

import { useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { clientConfig } from "@/client.config";
import type { Lead } from "@/lib/sheets";

interface LeadTableProps {
  leads: Lead[];
  allLeads: Lead[];
  formFilter: string;
  onFormFilterChange: (form: string) => void;
  onStatusChange: (lead: Lead, status: string, attempts?: number, plan?: string) => void;
  onHandledByChange: (lead: Lead, handledBy: string) => void;
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

  function handleSelect(value: string) {
    if (value === "__other__") {
      setIsOther(true);
    } else {
      setIsOther(false);
      onChange(lead, value);
    }
  }

  if (isOther) {
    return (
      <div className="flex items-center gap-1">
        <input
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
          autoFocus
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

/* ---------- Mobile Card ---------- */

function LeadCard({
  lead,
  onStatusChange,
  onHandledByChange,
}: {
  lead: Lead;
  onStatusChange: (lead: Lead, status: string, attempts?: number, plan?: string) => void;
  onHandledByChange: (lead: Lead, handledBy: string) => void;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-gray-900 text-sm">{lead.fullName}</p>
          <p className="text-xs text-gray-500 font-mono mt-0.5" dir="ltr">{lead.phone}</p>
        </div>
        <SourceBadge source={lead.platform} />
      </div>
      <div className="text-xs text-gray-400" dir="ltr">{formatDate(lead.createdTime)}</div>
      <div className="flex flex-col gap-2">
        <StatusSelect lead={lead} onStatusChange={onStatusChange} />
      </div>
      <div className="pt-1 border-t border-gray-50">
        <p className="text-xs text-gray-400 mb-1">{t("leads.table.handledBy")}</p>
        <HandledBySelect lead={lead} onChange={onHandledByChange} />
      </div>
    </div>
  );
}

/* ---------- Main Component ---------- */

export default function LeadTable({
  leads,
  allLeads,
  formFilter,
  onFormFilterChange,
  onStatusChange,
  onHandledByChange,
}: LeadTableProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const formNames = useMemo(() => {
    const names = new Set<string>();
    allLeads.forEach((l) => {
      if (l.formName?.trim()) names.add(l.formName);
    });
    return Array.from(names).sort();
  }, [allLeads]);

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
      {/* Form filter */}
      {formNames.length > 0 && (
        <div className="mb-4">
          <select
            value={formFilter}
            onChange={(e) => onFormFilterChange(e.target.value)}
            className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-sky/30 focus:border-brand-sky min-h-[40px]"
          >
            <option value="">{t("leads.filter.allForms")}</option>
            {formNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

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
                key={`${lead.sheetTab}:${lead.row}`}
                lead={lead}
                onStatusChange={onStatusChange}
                onHandledByChange={onHandledByChange}
              />
            ))}
          </div>

          {/* Desktop: Table layout */}
          <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <SortHeader label={t("leads.table.name")} sortKey="fullName" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label={t("leads.table.phone")} sortKey="phone" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label={t("leads.table.date")} sortKey="createdTime" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label={t("leads.table.status")} sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label={t("leads.table.handledBy")} sortKey="handledBy" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label={t("leads.table.source")} sortKey="platform" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {sortedLeads.map((lead) => (
                    <tr
                      key={`${lead.sheetTab}:${lead.row}`}
                      className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-3 py-3">
                        <span className="font-medium text-gray-900 text-sm">
                          {lead.fullName}
                        </span>
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
                      <td className="px-3 py-3">
                        <StatusSelect
                          lead={lead}
                          onStatusChange={onStatusChange}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <HandledBySelect
                          lead={lead}
                          onChange={onHandledByChange}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <SourceBadge source={lead.platform} />
                      </td>
                    </tr>
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
