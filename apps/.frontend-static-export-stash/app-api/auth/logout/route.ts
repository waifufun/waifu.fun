import { type NextRequest, NextResponse } from "next/server";

/**
 * Same-origin logout.
 *
 * Calls the backend's /auth/oauth/logout (clears wf_session) AND
 * /auth/twitter/logout (clears the legacy X-OAuth session if any),
 * then expires the wf_authed presence cookie on www.waifu.fun.
 *
 * Returns a JSON body the caller can react to.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.waifu.fun";

export async function POST(req: NextRequest) {
	const incomingCookie = req.headers.get("cookie") ?? "";
	const headers: HeadersInit = {
		"Content-Type": "application/json",
		...(incomingCookie ? { Cookie: incomingCookie } : {}),
	};

	// Best-effort: hit both backend logout endpoints. Either may not be
	// active, that's fine.
	const upstreamResponses = await Promise.allSettled([
		fetch(`${API_URL}/auth/oauth/logout`, { method: "POST", headers }),
		fetch(`${API_URL}/auth/twitter/logout`, { method: "POST", headers }),
	]);

	const out = NextResponse.json({ ok: true, data: { loggedOut: true } });

	// Mirror upstream Set-Cookie (clear cookies) back to browser.
	for (const result of upstreamResponses) {
		if (result.status !== "fulfilled") continue;
		const setCookies = result.value.headers.getSetCookie?.() ?? [];
		for (const cookie of setCookies) {
			out.headers.append("Set-Cookie", cookie);
		}
	}

	// Expire the wf_authed presence cookie on www.waifu.fun.
	out.headers.append("Set-Cookie", "wf_authed=; Max-Age=0; Path=/; SameSite=Lax; Domain=.waifu.fun; Secure");

	return out;
}
