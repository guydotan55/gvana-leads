export interface ClientConfig {
  name: string;
  slug: string;
  logo: string;
  locale: "he" | "en";
  dir: "rtl" | "ltr";
  brand: {
    primary: string;
    secondary: string;
    accent: string;
    accentLight: string;
    background: string;
  };
  statuses: Array<{
    key: string;
    label: string;
    color: "orange" | "blue" | "green" | "red" | "gray" | "purple";
  }>;
  interviewStatuses: Array<{
    key: string;
    label: string;
    color: "orange" | "blue" | "green" | "red" | "gray" | "purple";
  }>;
  features: {
    triggers: boolean;
    capi: boolean;
    multiSender: boolean;
    webhookFbLeads: boolean;
    alerts: boolean;
  };
  // CAPI event names per stage. `qualified` MUST equal the event mapped to the
  // "qualified" lead stage in Events Manager (Conversion-Leads) for the
  // QUALITY_LEAD ad set to optimize on our signal. `lead` documents the inbound
  // event Phase 1 already sends (not re-wired here).
  capiEvents: { lead: string; qualified: string; accepted: string };
  // CRM-source identification for Meta's Conversion-Leads funnel. `leadEventSource`
  // should match the CRM name registered in Meta Leads Access (the page's "CRMs"
  // tab). Sent in custom_data on qualified/accepted conversions; empty omits.
  capiCrm: { eventSource: string; leadEventSource: string };
  // Lead sources identified by their utm_medium at intake. Each becomes a
  // top-level option in the dashboard source filter.
  specialSources: Array<{ medium: string; label: string }>;
  integrations: {
    infobip: { enabled: boolean };
    capi: { enabled: boolean };
    sheets: { enabled: boolean };
  };
}

export const clientConfig: ClientConfig = {
  name: "מכינת גוונא",
  slug: "gavna",
  logo: "/logo.png",
  locale: "he",
  dir: "rtl",
  brand: {
    primary: "#1d2752",
    secondary: "#0EA5E9",
    accent: "#d9642c",
    accentLight: "#ec9e3f",
    background: "#ffffff",
  },
  statuses: [
    { key: "new", label: "חדש", color: "orange" },
    { key: "relevant", label: "רלוונטי", color: "green" },
    { key: "not_relevant", label: "לא רלוונטי", color: "red" },
    { key: "not_relevant_target", label: "לא רלוונטי (קהל יעד)", color: "blue" },
    { key: "unavailable", label: "לא זמין", color: "gray" },
  ],
  interviewStatuses: [
    { key: "under_review", label: "בבדיקה", color: "purple" },
    { key: "accepted", label: "התקבל", color: "green" },
    { key: "rejected", label: "נדחה", color: "red" },
  ],
  features: {
    triggers: true,
    capi: true,
    multiSender: false,
    webhookFbLeads: true,
    alerts: true,
  },
  capiEvents: { lead: "Lead", qualified: "CompleteRegistration", accepted: "Purchase" },
  capiCrm: { eventSource: "crm", leadEventSource: "Gavna_Leads" },
  specialSources: [
    { medium: "technology_list", label: "רשימת תפוצה מיוחדת – טכנולוגי" },
  ],
  integrations: {
    infobip: { enabled: true },
    capi: { enabled: true },
    sheets: { enabled: true },
  },
};
