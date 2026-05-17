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

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".ico")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const isApi = pathname.startsWith("/api/");

  // For API requests, returning a 307 redirect to /login (a GET-only page
  // route) makes the browser re-issue POST/PUT/DELETE to /login and get a
  // 405 back. Return a JSON 401 instead so client `fetch` callers can show
  // a friendly "session expired" message and keep the user's in-flight
  // form/editor state intact.
  const authFail = (clearCookie: boolean) => {
    if (isApi) {
      const res = NextResponse.json(
        { error: "session_expired" },
        { status: 401 },
      );
      if (clearCookie) res.cookies.delete(SESSION_COOKIE);
      return res;
    }
    const res = NextResponse.redirect(new URL("/login", request.url));
    if (clearCookie) res.cookies.delete(SESSION_COOKIE);
    return res;
  };

  if (!token) {
    return authFail(false);
  }

  const valid = await verifySession(token);
  if (!valid) {
    return authFail(true);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
