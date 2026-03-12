const DEFAULT_API_ORIGIN = "http://89.167.63.246:3100";
const HOP_BY_HOP_HEADERS = [
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
];

const normalizeApiOrigin = (value?: string | null) => {
	const trimmed = value?.trim();
	if (!trimmed) return DEFAULT_API_ORIGIN;
	if (trimmed === "http://89.167.63.246" || trimmed === "https://89.167.63.246") {
		return `${trimmed}:3100`;
	}
	return trimmed.replace(/\/+$/, "");
};

const getTargetOrigin = () => normalizeApiOrigin(process.env.API_ORIGIN || process.env.NEXT_PUBLIC_API_URL);

const proxyRequest = async (request: Request, context: { params: Promise<{ path: string[] }> }) => {
	try {
		const { path = [] } = await context.params;
		const incomingUrl = new URL(request.url);
		const targetUrl = new URL(`${getTargetOrigin()}/${path.map(encodeURIComponent).join("/")}`);
		targetUrl.search = incomingUrl.search;

		const headers = new Headers(request.headers);
		for (const header of HOP_BY_HOP_HEADERS) {
			headers.delete(header);
		}
		headers.set("x-forwarded-host", incomingUrl.host);
		headers.set("x-forwarded-proto", incomingUrl.protocol.replace(":", ""));

		const init: RequestInit = {
			method: request.method,
			headers,
			redirect: "manual",
		};
		if (request.method !== "GET" && request.method !== "HEAD") {
			const bodyText = await request.text();
			if (bodyText) {
				init.body = bodyText;
			}
		}

		const upstreamResponse = await fetch(targetUrl, init);
		return new Response(upstreamResponse.body, {
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText,
			headers: upstreamResponse.headers,
		});
	} catch (error) {
		console.error("[api proxy] Failed to reach waifu-core", error);
		return Response.json(
			{
				ok: false,
				error: {
					code: "UPSTREAM_UNAVAILABLE",
					message: "Unable to reach waifu-core backend.",
				},
			},
			{ status: 502 },
		);
	}
};

export const runtime = "nodejs";

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const OPTIONS = proxyRequest;
