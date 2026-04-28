import { NextRequest, NextResponse } from "next/server";
import { findOrphanedSubmissionTabs, reconcileOrphanedTabs } from "@/lib/forms-repo";

export const dynamic = "force-dynamic";

/** GET — preview only. Returns the list of orphaned tabs without changing anything. */
export async function GET() {
  try {
    const orphans = await findOrphanedSubmissionTabs();
    return NextResponse.json({ orphans });
  } catch (error) {
    console.error("Reconcile preview failed:", error);
    return NextResponse.json({ error: "Failed to scan for orphaned tabs" }, { status: 500 });
  }
}

/**
 * POST — actually clean up.
 * Body (optional): { titles?: string[] }
 *   - omitted        → cleans every orphan tab found.
 *   - titles: ["X"]  → cleans only orphans whose title is in the list.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const titles = Array.isArray(body?.titles)
      ? body.titles.filter((t: unknown): t is string => typeof t === "string")
      : undefined;
    const result = await reconcileOrphanedTabs(titles);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Reconcile failed:", error);
    return NextResponse.json({ error: "Failed to reconcile" }, { status: 500 });
  }
}
