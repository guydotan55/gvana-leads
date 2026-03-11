import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const TRIGGERS_PATH = path.join(process.cwd(), "config", "triggers.json");

export async function GET() {
  try {
    const data = await readFile(TRIGGERS_PATH, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json({ triggers: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    await writeFile(TRIGGERS_PATH, JSON.stringify(body, null, 2), "utf-8");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save triggers:", error);
    return NextResponse.json(
      { error: "Failed to save triggers" },
      { status: 500 }
    );
  }
}
