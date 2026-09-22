import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/intelligence",
  "/opportunities",
  "/risks",
  "/revenue",
  "/customers",
  "/operations",
  "/analytics",
  "/automations",
  "/integrations",
  "/team",
  "/settings",
  "/audit",
  "/notifications",
  "/help",
];

const AUTH_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/invite"];

const PUBLIC_ROUTES = ["/api", "/_next", "/favicon.ico", "/robots.txt", "/sitemap.xml"];

/**
 * Open workspace access switch. Mirrors `OPEN_WORKSPACE` from the server config,
 * read directly from the process environment because middleware runs on the edge
 * runtime and must not pull in the Prisma-backed config module.
 */
function openWorkspace() {
  return process.env.OPEN_WORKSPACE !== "false";
}

/**
 * Edge guard.
 *
 * · With open access enabled (the default for this demo deployment) an
 *   unauthenticated visitor is routed through `/api/auth/demo`, which issues a
 *   real session for the demo owner and sends them back to the page they asked
 *   for — nobody has to sign in to review the product.
 * · With `OPEN_WORKSPACE="false"` the classic behaviour applies: workspace
 *   routes require a session cookie and auth screens bounce signed-in users.
 * · A deliberate sign-out sets `nexus_signed_out`, which stops open access from
 *   silently re-authenticating the visitor until they ask for it again.
 *
 * Only the presence of the cookie is checked here; every page and API route
 * re-validates the session against the database, so a forged cookie grants
 * nothing.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get("nexus_session")?.value);
  const signedOut = Boolean(request.cookies.get("nexus_signed_out")?.value);
  const isPublic = PUBLIC_ROUTES.some((prefix) => pathname.startsWith(prefix));
  if (isPublic) return NextResponse.next();

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (openWorkspace() && !signedOut) {
    if (!hasSession && !isAuthRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/api/auth/demo";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (isAuthRoute && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)"],
};
