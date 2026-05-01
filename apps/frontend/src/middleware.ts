import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * W9.9 — Server-side auth gate.
 *
 * Anonymous users that hit /create/* or /patron/* get redirected back
 * to the homepage with `?signin=1&return_to=<original>`. The header on
 * the homepage watches for `?signin=1` and auto-opens the StewardLogin
 * modal (the Privy-style centered dialog Shadow likes). After OAuth
 * lands and the wf_session cookie is set, the modal honors return_to
 * and pushes the user to the page they originally asked for.
 *
 * We pick the homepage-with-modal pattern over routing to a separate
 * /auth/connect page on purpose — staying on a familiar page while
 * the modal opens is the Privy / Linear feel.
 *
 * Note: `output: "export"` / Cloudflare Pages static uploads do not run
 * middleware; `/create` and `/patron` rely on client-side gates there too.
 */

const PROTECTED_PREFIXES = [
	"/create", // wizard + any sub-paths
	"/patron", // patron dashboard + sub-paths
];

export function middleware(req: NextRequest) {
	const { pathname } = req.nextUrl;

	const requiresAuth = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
	if (!requiresAuth) return NextResponse.next();

	// wf_session is set by the W9.5 OAuth finalize endpoint
	// (apps/frontend/src/app/auth/oauth/callback/page.tsx + the API's
	// /auth/oauth/finalize handler). If it exists we let the request
	// through; the API will still validate the JWT shape on its side,
	// so this is a frontend gate, not a security boundary.
	const session = req.cookies.get("wf_session");
	if (session?.value) return NextResponse.next();

	const url = req.nextUrl.clone();
	url.pathname = "/";
	url.search = "";
	url.searchParams.set("signin", "1");
	url.searchParams.set("return_to", pathname);
	return NextResponse.redirect(url);
}

export const config = {
	matcher: ["/create/:path*", "/patron/:path*"],
};
