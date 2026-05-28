import { type NextRequest, NextResponse } from "next/server";

/**
 * Same-origin session-cookie finalize.
 *
 * Why this exists: cross-origin Set-Cookie from api.waifu.fun → www.waifu.fun
 * is reliably delivered in headless Chrome and curl, but real-world browsers
 * (Safari ITP, Brave shields, strict cookie policies) sometimes refuse to
 * STORE cookies returned from a cross-origin fetch even with credentials:include
 * + Access-Control-Allow-Credentials:true. The "same-site" rule is satisfied
 * (both subdomains share waifu.fun) but ITP can still purge them under various
 * heuristics.
 *
 * This route runs on www.waifu.fun (FIRST-PARTY origin to the user) and
 * proxies to the api.waifu.fun finalize endpoints server-to-server. It then
 * mirrors the upstream Set-Cookie back to the browser as a SAME-ORIGIN
 * Set-Cookie on www.waifu.fun. Browsers store same-origin cookies
 * unconditionally, so this bypasses the cross-origin storage failure mode.
 *
 * Body: { provider: "email" | "passkey" | "oauth" | "twitter", ...providerSpecificFields }
 * Returns: the upstream JSON body verbatim, plus the wf_session cookie set
 *          on the .waifu.fun domain via THIS response.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.waifu.fun";

type FinalizeBody =
	| {
			provider: "email";
			token: string;
			email: string;
	  }
	| {
			provider: "passkey";
			token: string;
			email?: string;
			return_to?: string;
	  }
	| {
			provider: "oauth";
			token: string;
			refreshToken?: string | null;
			primaryChain?: "evm" | "solana";
	  }
	| {
			provider: "twitter";
			code: string;
			return_to?: string;
	  };

function isFinalizeBody(value: unknown): value is FinalizeBody {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	if (v.provider === "email") return typeof v.email === "string";
	if (v.provider === "passkey") return typeof v.token === "string";
	if (v.provider === "oauth") return typeof v.token === "string";
	if (v.provider === "twitter") return typeof v.code === "string";
	return false;
}

function upstreamPathFor(provider: FinalizeBody["provider"]): string {
	if (provider === "email") return "/auth/email/finalize";
	if (provider === "passkey") return "/auth/passkey/finalize";
	if (provider === "twitter") return "/auth/twitter/finalize";
	return "/auth/oauth/finalize";
}

export async function POST(req: NextRequest) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ ok: false, error: "BAD_JSON", message: "expected JSON body" }, { status: 400 });
	}

	if (!isFinalizeBody(body)) {
		return NextResponse.json(
			{
				ok: false,
				error: "BAD_REQUEST",
				message: "expected { provider, token/code, ... }",
			},
			{ status: 400 },
		);
	}

	const { provider, ...providerBody } = body;
	const path = upstreamPathFor(provider);

	// Forward incoming cookies (e.g. wf_email_return / wf_oauth_return) so
	// the upstream API can read them.
	const incomingCookie = req.headers.get("cookie") ?? "";

	const upstreamRes = await fetch(`${API_URL}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(incomingCookie ? { Cookie: incomingCookie } : {}),
		},
		body: JSON.stringify(providerBody),
	});

	const responseText = await upstreamRes.text();
	let parsedBody: unknown;
	try {
		parsedBody = JSON.parse(responseText);
	} catch {
		parsedBody = { ok: false, raw: responseText };
	}

	const out = NextResponse.json(parsedBody as Record<string, unknown>, {
		status: upstreamRes.status,
	});

	// Mirror every upstream Set-Cookie back to the browser. Because THIS
	// response is from www.waifu.fun (same-origin to the user's page), the
	// browser stores these cookies unconditionally: no ITP / cross-site
	// storage shenanigans.
	//
	// Hono backend already set Domain=.waifu.fun on wf_session, which means
	// the cookie also lands on api.waifu.fun for subsequent fetch() calls.
	const setCookieHeaders = upstreamRes.headers.getSetCookie?.() ?? [];
	for (const cookie of setCookieHeaders) {
		out.headers.append("Set-Cookie", cookie);
	}

	// Also set a frontend-readable "is logged in" flag cookie so client-side
	// hooks (useAuthRequired) can detect the session without needing to read
	// the HttpOnly wf_session cookie. The actual JWT stays in the HttpOnly
	// cookie; this is just a presence flag.
	if (upstreamRes.ok) {
		out.headers.append("Set-Cookie", "wf_authed=1; Max-Age=2592000; Path=/; SameSite=Lax; Domain=.waifu.fun; Secure");
	}

	return out;
}
