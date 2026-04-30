import { NextResponse } from "next/server";
import { getLeads } from "@/lib/sheets";
import { classifyLead } from "@/lib/lead-type";
import { listForms } from "@/lib/forms-repo";
import { getViewCounts } from "@/lib/views-repo";

export const dynamic = "force-dynamic";

export interface FormStat {
  views7d: number;
  views30d: number;
  subs7d: number;
  subs30d: number;
  lastSubmissionAt: string | null;
}

function daysAgo(n: number): number {
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

export async function GET() {
  try {
    const [leads, builderForms, views7d, views30d] = await Promise.all([
      getLeads(),
      listForms(),
      getViewCounts(7),
      getViewCounts(30),
    ]);

    // Build slug → builder form id map; submissions for a builder form
    // come from leads whose sheetTab matches the builder's sheetTab.
    const builderBySheetTab: Record<string, string> = {};
    for (const def of builderForms) {
      builderBySheetTab[def.sheetTab] = def.id;
    }

    const cutoff7 = daysAgo(7);
    const cutoff30 = daysAgo(30);
    const subs7d: Record<string, number> = {};
    const subs30d: Record<string, number> = {};
    const lastByForm: Record<string, number> = {};

    for (const lead of leads) {
      // Only count leads that actually came through the public form
      // pages. Facebook Lead Ads webhooks (lead.leadId is a raw FB id
      // after stripping the `l:` prefix) are NOT form submissions —
      // including them would inflate the 'הגשות' count and make the
      // conversion rate meaningless (e.g. 31 subs / 1 visit = 3100%).
      // Organic-form leads keep the `org:` prefix on their id.
      if (!lead.leadId?.startsWith("org:")) continue;

      let slug: string;
      // Builder forms own a dedicated tab — that's the tightest signal.
      if (builderBySheetTab[lead.sheetTab]) {
        slug = builderBySheetTab[lead.sheetTab];
      } else {
        const cls = classifyLead(lead);
        if (cls.kind === "custom") continue; // custom + no matching builder = stale, ignore
        slug = cls.kind;
      }

      const ts = lead.createdTime ? Date.parse(lead.createdTime) : NaN;
      if (Number.isNaN(ts)) continue;
      if (ts >= cutoff30) subs30d[slug] = (subs30d[slug] || 0) + 1;
      if (ts >= cutoff7) subs7d[slug] = (subs7d[slug] || 0) + 1;
      if (!lastByForm[slug] || ts > lastByForm[slug]) {
        lastByForm[slug] = ts;
      }
    }

    // Union of all slugs we know about — hardcoded slugs + builder ids.
    const slugs: string[] = [
      "tech",
      "masa",
      "student",
      "instructor",
      ...builderForms.map((f) => f.id),
    ];

    const stats: Record<string, FormStat> = {};
    for (const slug of slugs) {
      stats[slug] = {
        views7d: views7d[slug] || 0,
        views30d: views30d[slug] || 0,
        subs7d: subs7d[slug] || 0,
        subs30d: subs30d[slug] || 0,
        lastSubmissionAt: lastByForm[slug] ? new Date(lastByForm[slug]).toISOString() : null,
      };
    }

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("form-stats failed:", error);
    const debug = {
      message: error instanceof Error ? error.message : String(error),
      gApi: (error as { response?: { status?: number; data?: unknown } }).response,
    };
    return NextResponse.json({ error: "Failed to compute stats", debug }, { status: 500 });
  }
}
