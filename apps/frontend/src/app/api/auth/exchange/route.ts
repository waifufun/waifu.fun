import { type NextRequest, NextResponse } from "next/server";

/**
 * Same-origin PKCE code→token exchange (dev-mode counterpart of the
 * Cloudflare Pages Function `functions/[[path]].js` → handleExchange).
 *
 * Steward requires PKCE for OAuth. After Steward redirects back to the
 * frontend callback with `?code=`, the SPA POSTs `{ code }` here. This route
 * proxies to the API's `/auth/oauth/exchange` server-to-server (forwarding the
 * HttpOnly `wf_oauth_pkce` cookie set at `/auth/oauth/start`) and mirrors the
 * resulting `wf_session` Set-Cookie back as a first-party cookie — same
 * rationale as the finalize route (avoids cross-origin / ITP cookie-storage
 * failures).
 *
 * NOTE: this file is stashed out of the static export build (see
 * scripts/static-export-build.mjs, which moves `src/app/api` aside). In
 * production the Pages Function handles `/api/auth/exchange`.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.waifu.fun";

export async function POST(req: NextRequest) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ ok: false, error: "BAD_JSON", message: "expected JSON body" }, { status: 400 });
	}

	if (!body || typeof body !== "object" || typeof (body as { code?: unknown }).code !== "string") {
		return NextResponse.json(
			{ ok: false, error: "BAD_REQUEST", message: "expected { code: string }" },
			{ status: 400 },
		);
	}

	const incomingCookie = req.headers.get("cookie") ?? "";

	const upstreamRes = await fetch(`${API_URL}/auth/oauth/exchange`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(incomingCookie ? { Cookie: incomingCookie } : {}),
		},
		body: JSON.stringify(body),
	});

	const responseText = await upstreamRes.text();
	let parsedBody: unknown;
	try {
		parsedBody = JSON.parse(responseText);
	} catch {
		parsedBody = { ok: false, raw: responseText };
	}

	const out = NextResponse.json(parsedBody as Record<string, unknown>, { status: upstreamRes.status });

	const setCookieHeaders = upstreamRes.headers.getSetCookie?.() ?? [];
	for (const cookie of setCookieHeaders) {
		out.headers.append("Set-Cookie", cookie);
	}

	if (upstreamRes.ok) {
		out.headers.append("Set-Cookie", "wf_authed=1; Max-Age=2592000; Path=/; SameSite=Lax; Domain=.waifu.fun; Secure");
	}

	return out;
}
