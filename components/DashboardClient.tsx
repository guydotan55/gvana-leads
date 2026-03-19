"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import StatsBar from "./StatsBar";
import LeadTable from "./LeadTable";
import { t } from "@/lib/i18n";
import type { Lead } from "@/lib/sheets";

const POLL_INTERVAL = 30_000;

export default function DashboardClient() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formFilter, setFormFilter] = useState("");
  const [updateError, setUpdateError] = useState("");
  const skipNextPoll = useRef(false);

  const fetchLeads = useCallback(async () => {
    if (skipNextPoll.current) {
      skipNextPoll.current = false;
      return;
    }
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

  async function handleStatusChange(lead: Lead, newStatus: string, attempts?: number) {
    const prevLeads = leads;
    // Optimistic update
    setLeads((prev) =>
      prev.map((l) =>
        l.row === lead.row
          ? { ...l, status: newStatus, attempts: attempts ?? l.attempts }
          : l
      )
    );
    skipNextPoll.current = true;

    try {
      const body: Record<string, unknown> = { status: newStatus };
      if (newStatus === "unavailable" && typeof attempts === "number") {
        body.attempts = attempts;
      }
      const res = await fetch(`/api/leads/${lead.row}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Update failed");
    } catch {
      // Revert on failure and show brief error
      setLeads(prevLeads);
      skipNextPoll.current = false;
      setUpdateError(t("common.error"));
      setTimeout(() => setUpdateError(""), 3000);
    }
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  const newToday = leads.filter(
    (l) => l.status === "new" && l.createdTime?.startsWith(todayISO)
  ).length;
  const relevant = leads.filter((l) => l.status === "relevant").length;
  const notRelevant = leads.filter((l) => l.status === "not_relevant").length;
  const unavailable = leads.filter((l) => l.status === "unavailable").length;

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
      {updateError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {updateError}
        </div>
      )}
      <StatsBar
        newToday={newToday}
        relevant={relevant}
        notRelevant={notRelevant}
        unavailable={unavailable}
      />
      <LeadTable
        leads={formFilter ? leads.filter((l) => l.formName === formFilter) : leads}
        allLeads={leads}
        formFilter={formFilter}
        onFormFilterChange={setFormFilter}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}
