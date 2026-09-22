import { NextResponse } from "next/server";

/**
 * Redirects with a *relative* `Location` header.
 *
 * `NextResponse.redirect()` demands an absolute URL, and the absolute URL a
 * request reports is derived from the address the server is bound to — which is
 * `http://0.0.0.0:3000` inside a container, not the host the visitor typed.
 * Behind a proxy, a tunnel or a preview domain that absolute location sends the
 * browser to an unreachable address. Relative locations are resolved against the
 * current document, so they are correct everywhere, including same-origin
 * redirects in server components and route handlers.
 */
export function relativeRedirect(path: string, status = 307) {
  const location = path.startsWith("/") ? path : `/${path}`;
  return new NextResponse(null, { status, headers: { location } });
}

/** Keeps only the path/query of a URL so redirects never leak another origin. */
export function relativePath(target: string | URL) {
  const url = typeof target === "string" ? new URL(target, "http://localhost") : target;
  return `${url.pathname}${url.search}`;
}
