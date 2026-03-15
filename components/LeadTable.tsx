"use client";

import { t } from "@/lib/i18n";
import StatusBadge from "./StatusBadge";
import type { Lead } from "@/lib/sheets";

interface LeadTableProps {
  leads: Lead[];
  onSendMessage: (lead: Lead) => void;
  onQualify: (lead: Lead) => void;
}

function SourceBadge({ source }: { source: string }) {
  const isFacebook = source?.toLowerCase().includes("facebook") || source?.toLowerCase().includes("fb");
  const isInstagram = source?.toLowerCase().includes("instagram") || source?.toLowerCase().includes("ig");

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

export default function LeadTable({ leads, onSendMessage, onQualify }: LeadTableProps) {
  if (leads.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
        <p className="text-gray-400">{t("leads.table.empty")}</p>
      </div>
    );
  }

  return (
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
                {t("leads.table.source")}
              </th>
              <th className="text-start px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                {t("leads.table.status")}
              </th>
              <th className="text-start px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                {t("leads.table.lastMessage")}
              </th>
              <th className="text-start px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                {t("leads.table.actions")}
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
                  <span className="font-medium text-gray-900">{lead.fullName}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-600 font-mono" dir="ltr">
                    {lead.phone}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <SourceBadge source={lead.platform} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge statusKey={lead.status} />
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-500 truncate max-w-[200px] block">
                    {lead.lastMessage || "—"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => onSendMessage(lead)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-sky text-white hover:opacity-90 transition-opacity"
                    >
                      {t("actions.send")}
                    </button>
                    {lead.status !== "qualified" && (
                      <button
                        onClick={() => onQualify(lead)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-orange text-white hover:opacity-90 transition-opacity"
                      >
                        {t("actions.qualify")}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
