/**
 * Public-facing lead-capture forms hosted by this app.
 * The slug becomes the URL path: /form/{slug}
 * leadType matches the categorization in DashboardClient.getLeadType().
 */
export type FormType = "student" | "instructor" | "tech" | "masa";

export type FieldType =
  | "text"
  | "phone"
  | "email"
  | "number"
  | "date"
  | "textarea"
  | "radio"
  | "checkbox";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: FieldOption[];
}

export interface FormConfig {
  slug: "student" | "instructor" | "tech" | "masa";
  leadType: FormType;
  title: string;
  subtitle: string;
  audience: string;
  accent: "navy" | "sky" | "orange" | "amber";
  /** Field structure exposed to the builder's "Clone" action. */
  cloneTemplate?: FormField[];
}

/** Builder-created form definition, persisted to the `_forms_meta` sheet tab. */
export interface FormDef {
  id: string;
  title: string;
  subtitle?: string;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  sheetTab: string;
  fields: FormField[];
}

/**
 * Reusable starter fields. Every builder form MUST contain at least one
 * `phone` field and one `text` field interpreted as the lead's name —
 * that's how submissions slot into the dashboard's name/phone columns.
 */
export const STARTER_FIELDS: FormField[] = [
  { id: "fullName", type: "text", label: "שם מלא", placeholder: "השם המלא שלך", required: true },
  { id: "phone", type: "phone", label: "מספר טלפון", placeholder: "050-0000000", required: true },
];

/* ---------- Hardcoded form clone templates ---------- */
/* Mirrors the field structure of the legacy 4 hardcoded forms so the
   "Clone" button in the builder can branch off them. The clone is a NEW
   FormDef stored in the sheet — the original hardcoded forms are
   unaffected. */

const TECH_FIELDS: FormField[] = [
  { id: "fullName", type: "text", label: "שם מלא", placeholder: "השם המלא שלך", required: true },
  { id: "phone", type: "phone", label: "מספר טלפון", placeholder: "050-0000000", required: true },
  { id: "city", type: "text", label: "עיר מגורים", placeholder: "עיר מגורים נוכחית", required: true },
  { id: "age", type: "number", label: "גיל", placeholder: "לדוגמה: 20", required: true },
  {
    id: "militaryStatus",
    type: "radio",
    label: "סטטוס מול צה״ל",
    required: true,
    options: [
      { value: "לפני צו ראשון", label: "לפני צו ראשון" },
      { value: "אחרי צו ראשון", label: "אחרי צו ראשון" },
      { value: "יש לי תאריך גיוס", label: "יש לי תאריך גיוס" },
      { value: "דחיית שירות", label: "דחיית שירות" },
      { value: "פטור/משוחרר", label: "פטור/משוחרר" },
    ],
  },
  {
    id: "interests",
    type: "checkbox",
    label: "מה מעניין אותך?",
    required: true,
    options: [
      { value: "פיתוח תוכנה", label: "פיתוח תוכנה" },
      { value: "סייבר", label: "סייבר" },
      { value: "AI", label: "AI" },
      { value: "ניהול רשתות", label: "ניהול רשתות" },
      { value: "אני רוצה ללמוד עוד ולהחליט", label: "אני רוצה ללמוד עוד ולהחליט" },
    ],
  },
];

const STUDENT_FIELDS: FormField[] = [
  { id: "fullName", type: "text", label: "שם מלא", placeholder: "השם המלא שלך", required: true },
  { id: "phone", type: "phone", label: "מספר טלפון", placeholder: "050-0000000", required: true },
  { id: "city", type: "text", label: "עיר מגורים", placeholder: "עיר מגורים נוכחית", required: true },
  { id: "age", type: "number", label: "גיל", placeholder: "לדוגמה: 18", required: true },
  { id: "school", type: "text", label: "בית ספר תיכון", placeholder: "שם בית הספר", required: false },
];

const MASA_FIELDS: FormField[] = [
  { id: "fullName", type: "text", label: "שם מלא", placeholder: "השם המלא שלך", required: true },
  { id: "phone", type: "phone", label: "מספר טלפון", placeholder: "050-0000000", required: true },
  { id: "releaseDate", type: "date", label: "תאריך שחרור", required: true },
  { id: "interests", type: "textarea", label: "מה מעניין אותך?", required: false },
];

const INSTRUCTOR_FIELDS: FormField[] = [
  { id: "fullName", type: "text", label: "שם מלא", placeholder: "השם המלא שלך", required: true },
  { id: "phone", type: "phone", label: "מספר טלפון", placeholder: "050-0000000", required: true },
  { id: "email", type: "email", label: "אימייל", placeholder: "name@example.com", required: true },
  { id: "experience", type: "textarea", label: "ניסיון רלוונטי", required: false },
];

export const FORMS: FormConfig[] = [
  {
    slug: "student",
    leadType: "student",
    title: "טופס חניכים",
    subtitle: "טופס הרשמה כללי לחניכי המכינה",
    audience: "מועמדים למכינה",
    accent: "navy",
    cloneTemplate: STUDENT_FIELDS,
  },
  {
    slug: "tech",
    leadType: "tech",
    title: "תוכנית טכנולוגית",
    subtitle: "הכשרה טכנולוגית מעשית לצד מכינה קדם צבאית",
    audience: "יחידות טכנולוגיה בצה״ל",
    accent: "sky",
    cloneTemplate: TECH_FIELDS,
  },
  {
    slug: "masa",
    leadType: "masa",
    title: "מסע משתחררים",
    subtitle: "תוכנית מסע ייעודית למשתחררי צה״ל",
    audience: "משוחררי צה״ל",
    accent: "orange",
    cloneTemplate: MASA_FIELDS,
  },
  {
    slug: "instructor",
    leadType: "instructor",
    title: "טופס מדריכים",
    subtitle: "הגשת מועמדות לתפקיד מדריך/ה במכינה",
    audience: "מועמדי הדרכה",
    accent: "amber",
    cloneTemplate: INSTRUCTOR_FIELDS,
  },
];

/** Slugs that are statically routed (cannot be used by builder forms). */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "student",
  "instructor",
  "tech",
  "masa",
  "new", // /forms/new is the builder route
]);
