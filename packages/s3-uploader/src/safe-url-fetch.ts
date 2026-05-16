import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class SafeFetchError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly status = 0,
	) {
		super(message);
		this.name = "SafeFetchError";
	}
}

export interface SafeFetchOptions {
	fetchImpl?: typeof fetch | undefined;
	lookupIpAddresses?: ((hostname: string) => Promise<string[]>) | undefined;
	maxRedirects?: number | undefined;
	timeoutMs?: number | undefined;
	maxBytes: number;
	allowedContentTypes?: readonly string[] | undefined;
	allowMissingContentType?: boolean | undefined;
	accept?: string | undefined;
}

export interface SafeFetchBytesResult {
	url: string;
	bytes: Uint8Array;
	contentType: string;
	status: number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function safeFetchBytes(inputUrl: string, opts: SafeFetchOptions): Promise<SafeFetchBytesResult> {
	const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
	const lookupIpAddresses = opts.lookupIpAddresses ?? defaultLookupIpAddresses;
	const maxRedirects = opts.maxRedirects ?? 3;
	const timeoutMs = opts.timeoutMs ?? 10_000;

	let url = parseAndValidateUrl(inputUrl);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
			await assertPublicAddress(url, lookupIpAddresses);
			const res = await fetchImpl(url.toString(), {
				redirect: "manual",
				signal: controller.signal,
				headers: opts.accept ? { Accept: opts.accept } : undefined,
			});

			if (REDIRECT_STATUSES.has(res.status)) {
				const location = res.headers.get("location");
				await res.body?.cancel();
				if (!location) throw new SafeFetchError("Redirect did not include Location", "redirect_missing", res.status);
				if (redirectCount === maxRedirects)
					throw new SafeFetchError("Too many redirects", "too_many_redirects", res.status);
				url = parseAndValidateUrl(new URL(location, url).toString());
				continue;
			}

			if (!res.ok) {
				await res.body?.cancel();
				throw new SafeFetchError(`Fetch failed with status ${res.status}`, "bad_status", res.status);
			}

			const contentType = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
			assertAllowedContentType(contentType, opts);
			const bytes = await readResponseBody(res, opts.maxBytes);
			return { url: url.toString(), bytes, contentType, status: res.status };
		}
	} catch (error) {
		if (error instanceof SafeFetchError) throw error;
		if (error instanceof Error && error.name === "AbortError") {
			throw new SafeFetchError(`Fetch timed out after ${timeoutMs}ms`, "timeout");
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}

	throw new SafeFetchError("Too many redirects", "too_many_redirects");
}

async function defaultLookupIpAddresses(hostname: string): Promise<string[]> {
	const addresses = await lookup(hostname, { all: true, verbatim: true });
	return addresses.map((entry) => entry.address);
}

function parseAndValidateUrl(rawUrl: string): URL {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new SafeFetchError("URL is not valid", "invalid_url");
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new SafeFetchError(`URL scheme ${url.protocol || "(none)"} is not allowed`, "blocked_scheme");
	}
	if (url.username || url.password) {
		throw new SafeFetchError("URL credentials are not allowed", "blocked_credentials");
	}
	return url;
}

async function assertPublicAddress(
	url: URL,
	lookupIpAddresses: (hostname: string) => Promise<string[]>,
): Promise<void> {
	const hostname = url.hostname.replace(/^\[|\]$/g, "");
	const addresses = isIP(hostname) ? [hostname] : await lookupIpAddresses(hostname);
	if (addresses.length === 0) throw new SafeFetchError(`No DNS addresses found for ${hostname}`, "dns_empty");
	for (const address of addresses) {
		if (isBlockedIp(address))
			throw new SafeFetchError(`URL resolves to a blocked address (${address})`, "blocked_address");
	}
}

function assertAllowedContentType(contentType: string, opts: SafeFetchOptions): void {
	if (!opts.allowedContentTypes?.length) return;
	if (!contentType && opts.allowMissingContentType) return;
	const allowed = opts.allowedContentTypes.some((allowedType) => {
		const normalized = allowedType.toLowerCase();
		return normalized.endsWith("/") ? contentType.startsWith(normalized) : contentType === normalized;
	});
	if (!allowed)
		throw new SafeFetchError(`Content-Type ${contentType || "(missing)"} is not allowed`, "blocked_content_type");
}

async function readResponseBody(res: Response, maxBytes: number): Promise<Uint8Array> {
	const contentLength = Number(res.headers.get("content-length") ?? "0");
	if (Number.isFinite(contentLength) && contentLength > maxBytes) {
		await res.body?.cancel();
		throw new SafeFetchError(`Response is larger than ${maxBytes} bytes`, "response_too_large", res.status);
	}

	const reader = res.body?.getReader();
	if (!reader) return new Uint8Array();

	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			throw new SafeFetchError(`Response is larger than ${maxBytes} bytes`, "response_too_large", res.status);
		}
		chunks.push(value);
	}

	const output = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return output;
}

function isBlockedIp(address: string): boolean {
	const normalized = address.toLowerCase().split("%", 1)[0] ?? address.toLowerCase();
	if (isIP(normalized) === 4) return isBlockedIpv4(normalized);
	const mapped = extractMappedIpv4(normalized);
	if (mapped) return isBlockedIpv4(mapped);
	if (normalized === "::" || normalized === "::1") return true;
	const firstHextet = normalized.startsWith("::") ? 0 : Number.parseInt(normalized.split(":")[0] ?? "0", 16);
	if (!Number.isFinite(firstHextet)) return true;
	return (firstHextet & 0xfe00) === 0xfc00 || (firstHextet & 0xffc0) === 0xfe80;
}

function extractMappedIpv4(address: string): string | null {
	if (!address.includes(".")) return null;
	const candidate = address.slice(address.lastIndexOf(":") + 1);
	return isIP(candidate) === 4 ? candidate : null;
}

function isBlockedIpv4(address: string): boolean {
	const parts = address.split(".").map((part) => Number.parseInt(part, 10));
	if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
	const [a = 0, b = 0] = parts;
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		a >= 224 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168)
	);
}
