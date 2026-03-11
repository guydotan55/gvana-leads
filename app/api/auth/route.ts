import { NextRequest, NextResponse } from "next/server";
import {
  verifyPassword,
  createSession,
  SESSION_COOKIE,
  SESSION_EXPIRY_DAYS,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const valid = await verifyPassword(password);
  if (!valid) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = await createSession();
  const response = NextResponse.json({ success: true });

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    path: "/",
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
