const DEFAULT_API_URL = "https://api.waifu.fun";

const hopByHopHeaders = new Set([
	"connection",
	"content-length",
	"host",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
]);

const json = (body, init = {}) =>
	new Response(JSON.stringify(body), {
		...init,
		headers: {
			"content-type": "application/json; charset=utf-8",
			...(init.headers ?? {}),
		},
	});

const getApiUrl = (env) => (env.NEXT_PUBLIC_API_URL || env.API_ORIGIN || DEFAULT_API_URL).replace(/\/+$/, "");

const getSetCookies = (headers) => {
	if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
	const cookie = headers.get("set-cookie");
	return cookie ? [cookie] : [];
};

const mirrorCookieForHost = (cookie, host) => {
	// Cloudflare preview URLs (raw *.pages.dev) cannot accept Domain=.waifu.fun
	// cookies. Strip Domain only when the user-facing host is itself a
	// .pages.dev domain. For any *.waifu.fun alias (waifu.fun, dev.waifu.fun,
	// www.waifu.fun) keep the Domain attribute so the wf_session cookie
	// reaches api.waifu.fun on subsequent fetch() calls.
	if (host.endsWith(".waifu.fun") || host === "waifu.fun") return cookie;
	if (!host.endsWith(".pages.dev")) return cookie;
	return cookie.replace(/;\s*Domain=[^;]+/i, "");
};

const appendUpstreamCookies = (out, upstream, host) => {
	for (const cookie of getSetCookies(upstream.headers)) {
		out.headers.append("Set-Cookie", mirrorCookieForHost(cookie, host));
	}
};

const sanitizeReturnTo = (raw) => {
	if (!raw || raw.length > 200) return "/patron";
	if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/patron";
	return raw;
};

const upstreamPathFor = (provider) => {
	if (provider === "email") return "/auth/email/finalize";
	if (provider === "passkey") return "/auth/passkey/finalize";
	if (provider === "twitter") return "/auth/twitter/finalize";
	return "/auth/oauth/finalize";
};

const isFinalizeBody = (value) => {
	if (!value || typeof value !== "object") return false;
	if (value.provider === "email") return typeof value.email === "string";
	if (value.provider === "passkey") return typeof value.token === "string";
	if (value.provider === "oauth") return typeof value.token === "string";
	if (value.provider === "twitter") return typeof value.code === "string";
	return false;
};

async function handleFinalize(request, env, host) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: "BAD_JSON", message: "expected JSON body" }, { status: 400 });
	}

	if (!isFinalizeBody(body)) {
		return json({ ok: false, error: "BAD_REQUEST", message: "expected { provider, token, ... }" }, { status: 400 });
	}

	const { provider, ...providerBody } = body;
	const upstream = await fetch(`${getApiUrl(env)}${upstreamPathFor(provider)}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(request.headers.get("cookie") ? { cookie: request.headers.get("cookie") } : {}),
		},
		body: JSON.stringify(providerBody),
	});

	const text = await upstream.text();
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		parsed = { ok: false, raw: text };
	}

	const out = json(parsed, { status: upstream.status });
	// DEBUG: expose host vars to diagnose cookie strip on dev subdomain.
	out.headers.set("x-debug-host", host);
	out.headers.set("x-debug-host-header", request.headers.get("host") ?? "<none>");
	out.headers.set("x-debug-url-host", new URL(request.url).hostname);
	out.headers.set("x-debug-mirror-test", host.endsWith(".waifu.fun") || host === "waifu.fun" ? "keep" : "strip");
	appendUpstreamCookies(out, upstream, host);
	if (upstream.ok) {
		// Keep Domain=.waifu.fun for any *.waifu.fun host. Only strip for raw
		// *.pages.dev preview URLs where the .waifu.fun parent isn't valid.
		const useWaifuDomain = host.endsWith(".waifu.fun") || host === "waifu.fun";
		const domain = useWaifuDomain ? "; Domain=.waifu.fun" : "";
		// Cosmetic frontend hint only. Backend authorization must always come
		// from upstream's HttpOnly wf_session cookie or an Authorization bearer.
		out.headers.append("Set-Cookie", `wf_authed=1; Max-Age=2592000; Path=/; SameSite=Lax${domain}; Secure`);
	}
	return out;
}

async function handleLogout(request, env, host) {
	const cookie = request.headers.get("cookie") ?? "";
	const headers = { "content-type": "application/json", ...(cookie ? { cookie } : {}) };
	const [oauth, twitter] = await Promise.allSettled([
		fetch(`${getApiUrl(env)}/auth/oauth/logout`, { method: "POST", headers }),
		fetch(`${getApiUrl(env)}/auth/twitter/logout`, { method: "POST", headers }),
	]);
	const out = json({ ok: true, data: { loggedOut: true } });
	for (const result of [oauth, twitter]) {
		if (result.status === "fulfilled") appendUpstreamCookies(out, result.value, host);
	}
	const useWaifuDomain = host.endsWith(".waifu.fun") || host === "waifu.fun";
	const domain = useWaifuDomain ? "; Domain=.waifu.fun" : "";
	out.headers.append("Set-Cookie", `wf_authed=; Max-Age=0; Path=/; SameSite=Lax${domain}; Secure`);
	return out;
}

function handleTwitterLogin(request, env) {
	const url = new URL(request.url);
	const upstream = new URL("/auth/twitter/login", getApiUrl(env));
	upstream.searchParams.set("return_to", sanitizeReturnTo(url.searchParams.get("return_to")));
	return Response.redirect(upstream.toString(), 302);
}

async function handleApiV1Proxy(request, env) {
	const incomingUrl = new URL(request.url);
	const path = incomingUrl.pathname.replace(/^\/api\/v1\/?/, "");
	const target = new URL(`${getApiUrl(env)}/${path.split("/").map(encodeURIComponent).join("/")}`);
	target.search = incomingUrl.search;

	const headers = new Headers(request.headers);
	for (const header of hopByHopHeaders) headers.delete(header);
	headers.set("x-forwarded-host", incomingUrl.host);
	headers.set("x-forwarded-proto", incomingUrl.protocol.replace(":", ""));

	const init = { method: request.method, headers, redirect: "manual" };
	if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.text();

	const upstream = await fetch(target, init);
	const outHeaders = new Headers(upstream.headers);
	for (const header of hopByHopHeaders) outHeaders.delete(header);
	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: outHeaders,
	});
}

/**
 * Same-origin transparent proxy for /v2/* and /v3/* API calls.
 *
 * Why: mobile in-app browser WebViews (zerion, MM mobile, trust, etc) block
 * cookies on cross-origin XHR even within the same registrable domain. A
 * fetch() from waifu.fun → api.waifu.fun with credentials:include refuses to
 * send the HttpOnly wf_session cookie under WebView privacy rules. Top-level
 * navigation (typing api.waifu.fun in the address bar) works fine — only XHR
 * is blocked. Confirmed via zerion 2026-05-21.
 *
 * Fix: route /v2/* and /v3/* through this function as same-origin. Function
 * then forwards server-to-server with the user's cookies attached. Browser
 * never has to send a cross-origin cookie.
 *
 * Companion change: credentialed FE call sites (lib/api/_fetcher.ts,
 * hooks/use-waifu-auth.ts, lib/{patron,claim}-api.ts, hooks/use-launchpads.ts,
 * hooks/use-linked-eoa.ts, components/agent-home/*) now read API_URL from
 * src/lib/same-origin-api.ts (empty string) so paths resolve same-origin.
 * Cross-origin URLs (OAuth start/finalize redirects, twitter login top-level
 * navigation, public SSG agent reads) are unchanged.
 */
async function handleVersionedApiProxy(request, env) {
	const incomingUrl = new URL(request.url);
	// Preserve the leading slash and the version prefix. Backend mounts
	// routes at /v2/... and /v3/... directly.
	const path = incomingUrl.pathname;
	const target = new URL(`${getApiUrl(env)}${path}`);
	target.search = incomingUrl.search;

	const headers = new Headers(request.headers);
	for (const header of hopByHopHeaders) headers.delete(header);
	headers.set("x-forwarded-host", incomingUrl.host);
	headers.set("x-forwarded-proto", incomingUrl.protocol.replace(":", ""));

	const init = { method: request.method, headers, redirect: "manual" };
	if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.text();

	const upstream = await fetch(target, init);
	const outHeaders = new Headers(upstream.headers);
	for (const header of hopByHopHeaders) outHeaders.delete(header);
	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: outHeaders,
	});
}

export async function onRequest(context) {
	const { request, env } = context;
	const url = new URL(request.url);
	// CF Pages with custom domain alias (dev.waifu.fun → develop.waifu-fun.pages.dev):
	// Host header / url.hostname / request.url all show the underlying *.pages.dev
	// domain, not the user-facing CNAME. We need the public hostname to decide
	// cookie Domain attribute. The browser sets Origin header to the page's
	// origin on cross-origin POST (which finalize always is, from a fetch call).
	//   - On dev.waifu.fun: Origin = "https://dev.waifu.fun" → host = dev.waifu.fun
	//   - On waifu.fun:     Origin = "https://waifu.fun"     → host = waifu.fun
	//   - Direct *.pages.dev: Origin = "https://*.pages.dev" → host = *.pages.dev
	// If Origin is missing (rare for browsers, common for curl/tools), fall
	// back to the Host header.
	const originHeader = request.headers.get("origin") ?? "";
	const refererHeader = request.headers.get("referer") ?? "";
	const hostHeader = request.headers.get("host") ?? "";
	let host = "";
	try {
		if (originHeader) host = new URL(originHeader).hostname;
	} catch {}
	if (!host && refererHeader) {
		try {
			host = new URL(refererHeader).hostname;
		} catch {}
	}
	if (!host) host = hostHeader.split(":")[0] || url.hostname;

	if (url.pathname === "/api/auth/finalize" && request.method === "POST") return handleFinalize(request, env, host);
	if (url.pathname === "/api/auth/logout" && request.method === "POST") return handleLogout(request, env, host);
	if (url.pathname === "/auth/twitter/login" && request.method === "GET") return handleTwitterLogin(request, env);
	if (url.pathname.startsWith("/api/v1/")) return handleApiV1Proxy(request, env);
	// Same-origin proxy for /v2/* and /v3/* — fixes mobile WebView XHR cookie
	// blocking. See handleVersionedApiProxy comment.
	if (url.pathname.startsWith("/v2/") || url.pathname.startsWith("/v3/")) return handleVersionedApiProxy(request, env);
	if (request.method === "GET" || request.method === "HEAD") {
		if (/^\/launch\/[^/]+\/?$/.test(url.pathname)) {
			url.pathname = "/launch/_";
			return env.ASSETS.fetch(new Request(url.toString(), request));
		}
		if (/^\/claim\/[^/]+\/?$/.test(url.pathname)) {
			url.pathname = "/claim/_";
			return env.ASSETS.fetch(new Request(url.toString(), request));
		}
	}

	return env.ASSETS.fetch(request);
}
