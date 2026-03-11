import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const MAPPINGS_PATH = path.join(process.cwd(), "config", "template-mappings.json");

export async function GET() {
  try {
    const data = await readFile(MAPPINGS_PATH, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json({ mappings: {} });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    await writeFile(MAPPINGS_PATH, JSON.stringify(body, null, 2), "utf-8");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save mappings:", error);
    return NextResponse.json(
      { error: "Failed to save mappings" },
      { status: 500 }
    );
  }
}
