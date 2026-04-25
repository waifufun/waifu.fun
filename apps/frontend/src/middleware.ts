import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Server-side auth gate for protected surfaces (W9.9).
 *
 * The wf_session cookie is set by the backend OAuth finalize endpoint
 * (apps/frontend/src/app/auth/oauth/callback handed it off via API). Its
 * presence is a strong UX signal that the user has a session in flight; the
 * backend remains the source of truth and will reject expired or invalid
 * tokens at the API boundary. This gate exists to avoid rendering protected
 * UI to anonymous users at all (better than a flash of dashboard followed by
 * a kick to /auth/connect).
 *
 * Anything not matched by `config.matcher` below sails through unchanged so
 * the public site (homepage, /agents, /agent/<id>, /litepaper, etc.) stays
 * fast and CDN-friendly.
 */

const PROTECTED_PREFIXES = ["/create", "/patron"] as const;

export function middleware(req: NextRequest) {
	const { pathname } = req.nextUrl;

	const requiresAuth = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

	if (!requiresAuth) return NextResponse.next();

	const session = req.cookies.get("wf_session");
	if (session?.value) return NextResponse.next();

	const url = req.nextUrl.clone();
	url.pathname = "/auth/connect";
	url.search = "";
	url.searchParams.set("return_to", pathname + (req.nextUrl.search || ""));
	return NextResponse.redirect(url);
}

export const config = {
	// Run only on the protected surfaces. Keep the matcher narrow so the
	// middleware stays cheap; everything else (api routes, _next, public
	// assets, /auth/*) opts out by simply not being listed.
	matcher: ["/create/:path*", "/patron/:path*"],
};
