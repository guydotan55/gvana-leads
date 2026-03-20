"use client";

import { useMemo } from "react";
import { t } from "@/lib/i18n";
import { clientConfig } from "@/client.config";
import type { Lead } from "@/lib/sheets";

interface LeadTableProps {
  leads: Lead[];
  allLeads: Lead[];
  formFilter: string;
  onFormFilterChange: (form: string) => void;
  onStatusChange: (lead: Lead, status: string, attempts?: number, plan?: string) => void;
}

const statusColorClasses: Record<string, string> = {
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  green: "bg-green-100 text-green-700 border-green-200",
  red: "bg-red-100 text-red-700 border-red-200",
  gray: "bg-gray-100 text-gray-700 border-gray-200",
  blue: "bg-blue-100 text-blue-700 border-blue-200",
};

function getStatusColor(statusKey: string): string {
  const status = clientConfig.statuses.find((s) => s.key === statusKey);
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

function StatusSelect({
  lead,
  onStatusChange,
}: {
  lead: Lead;
  onStatusChange: (lead: Lead, status: string, attempts?: number, plan?: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <select
        value={lead.status}
        onChange={(e) => onStatusChange(lead, e.target.value)}
        className={`px-2 py-1 rounded-full text-xs font-medium border cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-sky/30 ${getStatusColor(lead.status)}`}
      >
        {clientConfig.statuses.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      {lead.status === "unavailable" && (
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span>{t("leads.attempts")}: {lead.attempts}</span>
          <button
            onClick={() =>
              onStatusChange(lead, "unavailable", lead.attempts + 1)
            }
            className="w-5 h-5 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 text-gray-600 font-bold text-xs"
            title="+1"
          >
            +
          </button>
        </div>
      )}
      {lead.status === "accepted" && (
        <div className="flex items-center gap-1 text-xs">
          <select
            value={lead.plan || ""}
            onChange={(e) => onStatusChange(lead, "accepted", undefined, e.target.value)}
            className="px-1.5 py-0.5 rounded text-xs border border-green-200 bg-green-50 text-green-700 cursor-pointer focus:outline-none"
          >
            <option value="">{t("leads.plan.select")}</option>
            <option value="short">{t("leads.plan.short")}</option>
            <option value="long">{t("leads.plan.long")}</option>
            <option value="tech">{t("leads.plan.tech")}</option>
          </select>
        </div>
      )}
    </div>
  );
}

export default function LeadTable({
  leads,
  allLeads,
  formFilter,
  onFormFilterChange,
  onStatusChange,
}: LeadTableProps) {
  const formNames = useMemo(() => {
    const names = new Set<string>();
    allLeads.forEach((l) => {
      if (l.formName?.trim()) names.add(l.formName);
    });
    return Array.from(names).sort();
  }, [allLeads]);

  return (
    <div>
      {/* Form filter */}
      {formNames.length > 0 && (
        <div className="mb-4">
          <select
            value={formFilter}
            onChange={(e) => onFormFilterChange(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-sky/30 focus:border-brand-sky"
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

      {/* Table */}
      {leads.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <p className="text-gray-400">{t("leads.table.empty")}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-start px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    {t("leads.table.name")}
                  </th>
                  <th className="text-start px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    {t("leads.table.phone")}
                  </th>
                  <th className="text-start px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    {t("leads.table.date")}
                  </th>
                  <th className="text-start px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    {t("leads.table.source")}
                  </th>
                  <th className="text-start px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    {t("leads.table.status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.row}
                    className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">
                        {lead.fullName}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 font-mono" dir="ltr">
                        {lead.phone}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-500 whitespace-nowrap" dir="ltr">
                        {formatDate(lead.createdTime)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <SourceBadge source={lead.platform} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusSelect
                        lead={lead}
                        onStatusChange={onStatusChange}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
