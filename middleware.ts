import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/webhooks", "/api/organic-lead", "/api/track", "/api/form-views", "/form"];

// Public submission endpoint for builder-created forms. CRUD endpoints
// under /api/forms/[id] stay admin-only.
const PUBLIC_PATTERNS: RegExp[] = [/^\/api\/forms\/[^/]+\/submit$/];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (PUBLIC_PATTERNS.some((re) => re.test(pathname))) {
    return NextResponse.next();
  }

  // Static assets in /public are public by nature — let them through so
  // they're fetchable without a session (e.g. a campaign image referenced
  // as a WhatsApp image_url). Was .png/.ico only, which 401'd .jpg flyers.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    /\.(png|jpe?g|webp|gif|svg|ico)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const valid = await verifySession(token);
  if (!valid) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
