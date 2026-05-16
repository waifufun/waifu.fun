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
	// Cloudflare preview URLs cannot accept Domain=.waifu.fun cookies. Keep
	// production cookies untouched, but strip Domain on pages.dev so auth UI can
	// at least store first-party preview cookies during smoke tests.
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
	if (typeof value.token !== "string") return false;
	if (value.provider === "email") return typeof value.email === "string";
	return value.provider === "passkey" || value.provider === "oauth" || value.provider === "twitter";
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
	appendUpstreamCookies(out, upstream, host);
	if (upstream.ok) {
		const domain = host.endsWith(".pages.dev") ? "" : "; Domain=.waifu.fun";
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
	const domain = host.endsWith(".pages.dev") ? "" : "; Domain=.waifu.fun";
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

export async function onRequest(context) {
	const { request, env } = context;
	const url = new URL(request.url);
	const host = url.hostname;

	if (url.pathname === "/api/auth/finalize" && request.method === "POST") return handleFinalize(request, env, host);
	if (url.pathname === "/api/auth/logout" && request.method === "POST") return handleLogout(request, env, host);
	if (url.pathname === "/auth/twitter/login" && request.method === "GET") return handleTwitterLogin(request, env);
	if (url.pathname.startsWith("/api/v1/")) return handleApiV1Proxy(request, env);
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
