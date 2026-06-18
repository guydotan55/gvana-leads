import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/lib/config";
import { verifySignature, fetchLead, fetchFormName, mapLeadToRow, sanitizeTabName } from "@/lib/leadgen";
import { ensureFormTab, appendLead, leadExists, tabExists } from "@/lib/sheets";
import { getFormMappings, findTabByFormId, upsertFormMapping } from "@/lib/form-labels";
import { upsertPending, markDone } from "@/lib/capi-outbox";
import { sendCAPIEvent } from "@/lib/capi";
import { alert } from "@/lib/alerts";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.FB_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

async function processLead(leadgenId: string, formId: string): Promise<void> {
  // 1. resolve target tab by form id
  const maps = await getFormMappings();
  let sheetTab = findTabByFormId(maps, formId);
  let sourceName = "";

  if (sheetTab) {
    // mapped but tab might have been deleted/renamed → fail loud (no auto-repair)
    if (!(await tabExists(sheetTab))) {
      await alert(`missing-tab:${sheetTab}`, `Mapped tab "${sheetTab}" is missing for form ${formId}`, `lead ${leadgenId}`);
      throw new Error(`mapped tab missing: ${sheetTab}`);
    }
  } else {
    sourceName = await fetchFormName(formId);
    sheetTab = sanitizeTabName(sourceName, maps.map((m) => m.sheetTab));
    await ensureFormTab(sheetTab);
    await upsertFormMapping({ formId, sheetTab, sourceName, label: "" });
  }

  // 2. dedup
  if (await leadExists(leadgenId, sheetTab)) return;

  // 3. fetch + map + write
  const lead = await fetchLead(leadgenId);
  const formName = sourceName || (maps.find((m) => m.formId === formId)?.sourceName ?? sheetTab);
  const row = mapLeadToRow(lead, formName);
  if (!row[13] || !row[14]) {
    await alert(`missing-field:${leadgenId}`, `Lead ${leadgenId} missing name or phone`, JSON.stringify(lead.field_data));
  }
  await appendLead(sheetTab, row);

  // 4. CAPI (guaranteed via outbox) — gated by features.capi
  if (isFeatureEnabled("capi")) {
    await upsertPending(leadgenId, sheetTab);
    const phone = normalizePhone(row[14] || "");
    const ok = await sendCAPIEvent({ eventName: "Lead", eventId: leadgenId, leadId: leadgenId, phone });
    if (ok) await markDone(leadgenId);
  }
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.FB_APP_SECRET;
  const raw = await request.text();
  const sig = request.headers.get("x-hub-signature-256");
  if (!appSecret || !verifySignature(raw, sig, appSecret)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isFeatureEnabled("webhookFbLeads")) {
    return NextResponse.json({ success: true, skipped: "feature off" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const changes: { leadgen_id: string; form_id: string }[] = [];
  for (const entry of payload.entry || []) {
    for (const ch of entry.changes || []) {
      if (ch.field === "leadgen" && ch.value?.leadgen_id) {
        changes.push({ leadgen_id: ch.value.leadgen_id, form_id: ch.value.form_id });
      }
    }
  }

  try {
    for (const c of changes) {
      await processLead(c.leadgen_id, c.form_id);
    }
  } catch (err) {
    console.error("leadgen ingestion error:", err);
    await alert(`ingest-error`, `Ingestion failed: ${(err as Error).message}`);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
