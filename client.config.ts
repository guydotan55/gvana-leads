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
    color: "orange" | "blue" | "green" | "red" | "gray";
  }>;
  features: {
    triggers: boolean;
    capi: boolean;
    multiSender: boolean;
    webhookFbLeads: boolean;
  };
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
    { key: "unavailable", label: "לא זמין", color: "gray" },
    { key: "interviewed", label: "הוזמן לריאיון", color: "blue" },
    { key: "under_review", label: "בבדיקה", color: "orange" },
    { key: "accepted", label: "התקבל", color: "green" },
    { key: "rejected", label: "נדחה", color: "red" },
  ],
  features: {
    triggers: true,
    capi: true,
    multiSender: false,
    webhookFbLeads: true,
  },
  integrations: {
    infobip: { enabled: true },
    capi: { enabled: true },
    sheets: { enabled: true },
  },
};
