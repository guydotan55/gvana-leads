/**
 * Public-facing lead-capture forms hosted by this app.
 * The slug becomes the URL path: /form/{slug}
 * leadType matches the categorization in DashboardClient.getLeadType().
 */
export type FormType = "student" | "instructor" | "tech" | "masa";

export interface FormConfig {
  slug: "student" | "instructor" | "tech" | "masa";
  leadType: FormType;
  title: string;
  subtitle: string;
  audience: string;
  accent: "navy" | "sky" | "orange" | "amber";
}

export const FORMS: FormConfig[] = [
  {
    slug: "student",
    leadType: "student",
    title: "טופס חניכים",
    subtitle: "טופס הרשמה כללי לחניכי המכינה",
    audience: "מועמדים למכינה",
    accent: "navy",
  },
  {
    slug: "tech",
    leadType: "tech",
    title: "תוכנית טכנולוגית",
    subtitle: "הכשרה טכנולוגית מעשית לצד מכינה קדם צבאית",
    audience: "יחידות טכנולוגיה בצה״ל",
    accent: "sky",
  },
  {
    slug: "masa",
    leadType: "masa",
    title: "מסע משתחררים",
    subtitle: "תוכנית מסע ייעודית למשתחררי צה״ל",
    audience: "משוחררי צה״ל",
    accent: "orange",
  },
  {
    slug: "instructor",
    leadType: "instructor",
    title: "טופס מדריכים",
    subtitle: "הגשת מועמדות לתפקיד מדריך/ה במכינה",
    audience: "מועמדי הדרכה",
    accent: "amber",
  },
];
