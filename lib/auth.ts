import { SignJWT, jwtVerify } from "jose";
import { compare } from "bcryptjs";
import { cookies } from "next/headers";

const SESSION_COOKIE = "leads_session";
const SESSION_EXPIRY_DAYS = 7;

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET env var is required");
  return new TextEncoder().encode(secret);
}

export async function verifyPassword(password: string): Promise<boolean> {
  const hash = process.env.CLIENT_PASSWORD_HASH;
  if (!hash) throw new Error("CLIENT_PASSWORD_HASH env var is required");
  return compare(password, hash);
}

export async function createSession(): Promise<string> {
  const token = await new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SESSION_EXPIRY_DAYS}d`)
    .setIssuedAt()
    .sign(getSecret());
  return token;
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export function getSessionCookie(): string | undefined {
  const cookieStore = cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

export { SESSION_COOKIE, SESSION_EXPIRY_DAYS };
