/**
 * Lead categorization. Single source of truth for which "type" a lead
 * belongs to. Used by both the dashboard filter and the type column.
 */
import type { Lead } from "@/lib/sheets";

export type CoreLeadType = "student" | "instructor" | "tech" | "masa";

const TECH_ADSET_ID = "120240874975730446";

/** Sheet tabs that are *known* legacy tabs — anything outside these is
 * assumed to be a builder-created form's tab and gets classified as
 * "custom" with the form's own title as its display name. */
const LEGACY_TABS: ReadonlySet<string> = new Set([
  "לידים",
  "אורגני",
]);

export interface LeadTypeInfo {
  /** Stable kind used for filters & color mapping. */
  kind: CoreLeadType | "custom";
  /** Display label shown in the table cell. */
  label: string;
}

const CORE_LABELS: Record<CoreLeadType, string> = {
  student: "חניכים",
  tech: "טכנולוגי",
  masa: "מסע משתחררים",
  instructor: "מדריכים",
};

export function classifyLead(lead: Lead): LeadTypeInfo {
  const name = lead.formName || "";
  const tab = lead.sheetTab || "";
  const combined = name + tab;

  if (combined.includes("מדריך") || combined.includes("מדריכ")) {
    return { kind: "instructor", label: CORE_LABELS.instructor };
  }
  if (combined.includes("מסע משתחררים")) {
    return { kind: "masa", label: CORE_LABELS.masa };
  }
  const rawAdsetId = (lead.adsetId || "").replace(/^as:/, "");
  if (combined.includes("טכנולוגית") || rawAdsetId === TECH_ADSET_ID) {
    return { kind: "tech", label: CORE_LABELS.tech };
  }

  // If the lead is in a tab that isn't one of the legacy tabs and isn't a
  // known form keyword, treat it as a builder-created form and surface
  // the form's own name as the label.
  if (tab && !LEGACY_TABS.has(tab) && !tab.startsWith("_")) {
    return { kind: "custom", label: name || tab };
  }

  return { kind: "student", label: CORE_LABELS.student };
}

/** Backwards-compat helper used by the existing filter logic. */
export function getCoreLeadType(lead: Lead): CoreLeadType {
  const { kind } = classifyLead(lead);
  return kind === "custom" ? "student" : kind;
}
