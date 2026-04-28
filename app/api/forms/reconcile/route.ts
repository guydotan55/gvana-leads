import { NextResponse } from "next/server";
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

/** POST — actually clean up: delete empty orphans, archive non-empty ones. */
export async function POST() {
  try {
    const result = await reconcileOrphanedTabs();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Reconcile failed:", error);
    return NextResponse.json({ error: "Failed to reconcile" }, { status: 500 });
  }
}
