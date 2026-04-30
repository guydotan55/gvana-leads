"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import StatsBar from "./StatsBar";
import LeadTable from "./LeadTable";
import { t } from "@/lib/i18n";
import type { Lead } from "@/lib/sheets";
import { getCoreLeadType } from "@/lib/lead-type";

const POLL_INTERVAL = 30_000;

function getLeadSource(lead: Lead): "facebook" | "organic" | "paid" | "website" {
  const p = (lead.platform || "").toLowerCase();
  const isFormLead = lead.leadId?.startsWith("org:");
  if (p === "organic") return "organic";
  if (p === "website") return "website";
  // LP form leads with facebook platform = paid, native FB leads = facebook
  if (isFormLead && (p === "facebook" || p === "instagram")) return "paid";
  return "facebook";
}

export default function DashboardClient() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [updateError, setUpdateError] = useState("");
  const skipNextPoll = useRef(false);

  const fetchLeads = useCallback(async () => {
    // Polling-skip flag: an optimistic-update handler set this so the
    // very next poll doesn't clobber the in-flight optimistic state.
    // We must still clear `loading` so the page never gets stuck on
    // the loading screen if this branch happens to fire on first mount.
    if (skipNextPoll.current) {
      skipNextPoll.current = false;
      setLoading(false);
      return;
    }
    // Hard timeout — if /api/leads ever hangs (Sheets API stalled,
    // edge cold-start, network mid-loss), abort after 25s instead of
    // leaving the user staring at "טוען..." forever.
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 25_000) : null;
    try {
      const res = await fetch("/api/leads", {
        credentials: "same-origin",
        redirect: "manual",
        headers: { Accept: "application/json" },
        signal: ctrl?.signal,
      });
      if (res.type === "opaqueredirect" || res.status === 0 || (res.status >= 300 && res.status < 400)) {
        // Auth redirect — session expired between page load and fetch.
        // Surface that explicitly so the user can re-login instead of
        // staring at a hung loader.
        throw new Error("ההפעלה פגה — רענן את הדף או התחבר שוב");
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}`);
      }
      const data = await res.json();
      setLeads(data.leads);
      setError("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("common.error");
      console.error("fetchLeads failed:", err);
      setError(`${t("common.error")} — ${msg}`);
    } finally {
      if (timer) clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
    const interval = setInterval(fetchLeads, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchLeads]);

  // On mount (incl. after login redirect / direct nav), make sure the
  // user lands at the top of the dashboard. Mobile browsers and
  // Next.js's scroll restoration occasionally preserve the prior
  // scroll position, which is jarring when the leads table loads in
  // and shifts the page.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  async function handleStatusChange(lead: Lead, newStatus: string, attempts?: number, plan?: string) {
    const prevLeads = leads;
    setLeads((prev) =>
      prev.map((l) =>
        l.row === lead.row && l.sheetTab === lead.sheetTab
          ? { ...l, status: newStatus, attempts: attempts ?? l.attempts, plan: plan ?? l.plan }
          : l
      )
    );
    skipNextPoll.current = true;

    try {
      const body: Record<string, unknown> = { status: newStatus, sheetTab: lead.sheetTab };
      if (newStatus === "unavailable" && typeof attempts === "number") {
        body.attempts = attempts;
      }
      if ((newStatus === "under_review" || newStatus === "accepted") && typeof plan === "string") {
        body.plan = plan;
      }
      const res = await fetch(`/api/leads/${lead.row}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Update failed");
    } catch {
      setLeads(prevLeads);
      skipNextPoll.current = false;
      setUpdateError(t("common.error"));
      setTimeout(() => setUpdateError(""), 3000);
    }
  }

  async function handleHandledByChange(lead: Lead, handledBy: string) {
    const prevLeads = leads;
    setLeads((prev) =>
      prev.map((l) =>
        l.row === lead.row && l.sheetTab === lead.sheetTab
          ? { ...l, handledBy }
          : l
      )
    );
    skipNextPoll.current = true;

    try {
      const res = await fetch(`/api/leads/${lead.row}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: lead.status, handledBy, sheetTab: lead.sheetTab }),
      });
      if (!res.ok) throw new Error("Update failed");
    } catch {
      setLeads(prevLeads);
      skipNextPoll.current = false;
      setUpdateError(t("common.error"));
      setTimeout(() => setUpdateError(""), 3000);
    }
  }

  async function handleDelete(lead: Lead) {
    const prevLeads = leads;
    setLeads((prev) =>
      prev
        .filter((l) => !(l.row === lead.row && l.sheetTab === lead.sheetTab))
        .map((l) =>
          l.sheetTab === lead.sheetTab && l.row > lead.row
            ? { ...l, row: l.row - 1 }
            : l
        )
    );
    skipNextPoll.current = true;

    try {
      const res = await fetch(`/api/leads/${lead.row}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetTab: lead.sheetTab,
          expectedLeadId: lead.leadId || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Delete failed");
      }
    } catch (err) {
      setLeads(prevLeads);
      skipNextPoll.current = false;
      const msg = err instanceof Error && err.message.toLowerCase().includes("mismatch")
        ? t("leads.delete.errorMismatch")
        : t("leads.delete.errorGeneric");
      setUpdateError(msg);
      setTimeout(() => setUpdateError(""), 4000);
    }
  }

  async function handleCommentChange(lead: Lead, comment: string) {
    const prevLeads = leads;
    setLeads((prev) =>
      prev.map((l) =>
        l.row === lead.row && l.sheetTab === lead.sheetTab
          ? { ...l, comment }
          : l
      )
    );
    skipNextPoll.current = true;

    try {
      const res = await fetch(`/api/leads/${lead.row}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: lead.status, comment, sheetTab: lead.sheetTab }),
      });
      if (!res.ok) throw new Error("Update failed");
    } catch {
      setLeads(prevLeads);
      skipNextPoll.current = false;
      setUpdateError(t("common.error"));
      setTimeout(() => setUpdateError(""), 3000);
    }
  }

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (typeFilter && getCoreLeadType(l) !== typeFilter) return false;
      if (sourceFilter && getLeadSource(l) !== sourceFilter) return false;
      return true;
    });
  }, [leads, typeFilter, sourceFilter]);

  const todayISO = new Date().toISOString().slice(0, 10);
  const newToday = leads.filter(
    (l) => l.status === "new" && l.createdTime?.startsWith(todayISO)
  ).length;
  const relevant = leads.filter((l) => ["relevant", "under_review", "accepted", "rejected"].includes(l.status)).length;
  const interviewed = leads.filter((l) => ["under_review", "accepted", "rejected"].includes(l.status)).length;
  const accepted = leads.filter((l) => l.status === "accepted").length;

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

  const filterClass = "px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-sky/30 focus:border-brand-sky min-h-[40px]";

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
        interviewed={interviewed}
        accepted={accepted}
      />
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className={filterClass}
        >
          <option value="">{t("leads.filter.leadType")}: {t("leads.filter.allTypes")}</option>
          <option value="student">{t("leads.filter.students")}</option>
          <option value="tech">{t("leads.filter.tech")}</option>
          <option value="masa">{t("leads.filter.masa")}</option>
          <option value="instructor">{t("leads.filter.instructors")}</option>
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className={filterClass}
        >
          <option value="">{t("leads.filter.source")}: {t("leads.filter.allSources")}</option>
          <option value="facebook">{t("leads.filter.facebook")}</option>
          <option value="paid">{t("leads.filter.paid")}</option>
          <option value="organic">{t("leads.filter.organic")}</option>
          <option value="website">{t("leads.filter.website")}</option>
        </select>
      </div>
      <LeadTable
        leads={filteredLeads}
        onStatusChange={handleStatusChange}
        onHandledByChange={handleHandledByChange}
        onCommentChange={handleCommentChange}
        onDelete={handleDelete}
      />
    </div>
  );
}
