"use client";

import { useState, useEffect, useCallback } from "react";
import StatsBar from "./StatsBar";
import LeadTable from "./LeadTable";
import SendMessageDialog from "./SendMessageDialog";
import { t } from "@/lib/i18n";
import { clientConfig } from "@/client.config";
import type { Lead } from "@/lib/sheets";

const POLL_INTERVAL = 30_000;

export default function DashboardClient() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sendingTo, setSendingTo] = useState<Lead | null>(null);

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/leads");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setLeads(data.leads);
      setError("");
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
    const interval = setInterval(fetchLeads, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchLeads]);

  const today = new Date().toLocaleDateString(clientConfig.locale === "he" ? "he-IL" : "en-US");
  const newToday = leads.filter(
    (l) => l.status === "new" && l.createdAt?.includes(today)
  ).length;
  const messagesSent = leads.filter((l) =>
    ["sent", "read", "qualified"].includes(l.status)
  ).length;
  const readReceipts = leads.filter((l) =>
    ["read", "qualified"].includes(l.status)
  ).length;
  const qualified = leads.filter((l) => l.status === "qualified").length;

  function handleSendMessage(lead: Lead) {
    setSendingTo(lead);
  }

  async function handleQualify(lead: Lead) {
    try {
      const res = await fetch("/api/leads/qualify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadRow: lead.row }),
      });
      if (res.ok) {
        fetchLeads();
      }
    } catch (err) {
      console.error("Qualify failed:", err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-400">{t("common.loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-red-500">{error}</p>
        <button
          onClick={fetchLeads}
          className="px-4 py-2 bg-brand-navy text-white rounded-lg text-sm"
        >
          {t("common.refresh")}
        </button>
      </div>
    );
  }

  return (
    <div>
      <StatsBar
        newToday={newToday}
        messagesSent={messagesSent}
        readReceipts={readReceipts}
        qualified={qualified}
      />
      <LeadTable
        leads={leads}
        onSendMessage={handleSendMessage}
        onQualify={handleQualify}
      />
      {sendingTo && (
        <SendMessageDialog
          lead={sendingTo}
          onClose={() => setSendingTo(null)}
          onSent={fetchLeads}
        />
      )}
    </div>
  );
}
