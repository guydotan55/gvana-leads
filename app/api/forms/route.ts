import { NextRequest, NextResponse } from "next/server";
import { listForms, createForm } from "@/lib/forms-repo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const forms = await listForms();
    return NextResponse.json({ forms });
  } catch (error) {
    console.error("List forms failed:", error);
    return NextResponse.json({ error: "Failed to list forms" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, subtitle, fields, status, slug } = body || {};
    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!Array.isArray(fields) || fields.length === 0) {
      return NextResponse.json({ error: "At least one field is required" }, { status: 400 });
    }
    const form = await createForm({ title, subtitle, fields, status, slug });
    return NextResponse.json({ form });
  } catch (error) {
    console.error("Create form failed:", error);
    const msg = error instanceof Error ? error.message : "Failed to create form";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
