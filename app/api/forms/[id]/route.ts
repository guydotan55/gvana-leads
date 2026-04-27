import { NextRequest, NextResponse } from "next/server";
import { getForm, updateForm, deleteForm } from "@/lib/forms-repo";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const form = await getForm(id);
    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }
    return NextResponse.json({ form });
  } catch (error) {
    console.error("Get form failed:", error);
    return NextResponse.json({ error: "Failed to fetch form" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updated = await updateForm(id, body);
    return NextResponse.json({ form: updated });
  } catch (error) {
    console.error("Update form failed:", error);
    const msg = error instanceof Error ? error.message : "Failed to update form";
    const status = msg.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteForm(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete form failed:", error);
    return NextResponse.json({ error: "Failed to delete form" }, { status: 500 });
  }
}
