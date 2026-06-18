import { createHmac, timingSafeEqual } from "crypto";
import columnsConfig from "@/config/columns.json";

export interface GraphLead {
  id: string;
  created_time: string;
  field_data: { name: string; values: string[] }[];
  ad_id?: string; ad_name?: string;
  adset_id?: string; adset_name?: string;
  campaign_id?: string; campaign_name?: string;
  form_id?: string;
  is_organic?: boolean;
  platform?: string;
}

export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const theirs = header.slice("sha256=".length);
  const ours = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(ours, "hex");
  const b = Buffer.from(theirs, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function extractField(fd: GraphLead["field_data"], names: string[]): string {
  for (const want of names) {
    const f = fd?.find((x) => x.name?.toLowerCase() === want);
    if (f && f.values?.[0]) return String(f.values[0]).trim();
  }
  return "";
}

export function extractName(fd: GraphLead["field_data"]): string {
  const full = extractField(fd, ["full_name"]);
  if (full) return full;
  const first = extractField(fd, ["first_name"]);
  const last = extractField(fd, ["last_name"]);
  return [first, last].filter(Boolean).join(" ").trim();
}

export const extractPhone = (fd: GraphLead["field_data"]) => extractField(fd, ["phone_number", "phone"]);
export const extractEmail = (fd: GraphLead["field_data"]) => extractField(fd, ["email"]);

export function mapLeadToRow(lead: GraphLead, formName: string): string[] {
  const fb = columnsConfig.fbColumns;
  const row: string[] = new Array(16).fill("");
  row[fb.leadId.index] = lead.id || "";
  row[fb.createdTime.index] = lead.created_time || "";
  row[fb.adId.index] = lead.ad_id || "";
  row[fb.adName.index] = lead.ad_name || "";
  row[fb.adsetId.index] = lead.adset_id || "";
  row[fb.adsetName.index] = lead.adset_name || "";
  row[fb.campaignId.index] = lead.campaign_id || "";
  row[fb.campaignName.index] = lead.campaign_name || "";
  row[fb.formId.index] = lead.form_id || "";
  row[fb.formName.index] = formName || "";
  row[fb.isOrganic.index] = lead.is_organic === undefined ? "" : String(lead.is_organic);
  row[fb.platform.index] = lead.platform || "";
  row[fb.interest.index] = "";
  row[fb.fullName.index] = extractName(lead.field_data);
  row[fb.phoneNumber.index] = extractPhone(lead.field_data);
  row[fb.leadStatus.index] = "";
  return row;
}

export function sanitizeTabName(name: string, existing: string[]): string {
  let base = (name || "טופס").replace(/['\[\]:\\/?*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
  if (!base) base = "טופס";
  if (!existing.includes(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} ${i}`.slice(0, 90);
    if (!existing.includes(candidate)) return candidate;
  }
  return base;
}
