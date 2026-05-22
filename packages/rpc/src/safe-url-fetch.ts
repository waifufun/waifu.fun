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

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function safeFetchJson<T>(inputUrl: string, opts: SafeFetchOptions): Promise<T> {
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
				headers: { Accept: opts.accept ?? "application/json" },
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
			assertAllowedContentType(contentType, {
				...opts,
				allowedContentTypes: opts.allowedContentTypes ?? ["application/json", "text/json", "text/plain"],
				allowMissingContentType: opts.allowMissingContentType ?? true,
			});
			const bytes = await readResponseBody(res, opts.maxBytes);
			try {
				return JSON.parse(new TextDecoder().decode(bytes)) as T;
			} catch {
				throw new SafeFetchError(`Response from ${url.toString()} was not valid JSON`, "invalid_json", res.status);
			}
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
	if (url.protocol !== "https:") {
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
	const bytes = parseIpv6Bytes(normalized);
	if (!bytes) return true;
	const byte = (index: number) => bytes[index] ?? 0;
	const firstWord = (byte(0) << 8) | byte(1);
	return (
		bytes.every((byte) => byte === 0) ||
		(bytes.slice(0, 15).every((byte) => byte === 0) && byte(15) === 1) ||
		(bytes.slice(0, 12).every((byte) => byte === 0) && isBlockedIpv4(bytesToIpv4(bytes, 12))) ||
		(bytes.slice(0, 10).every((byte) => byte === 0) &&
			byte(10) === 0xff &&
			byte(11) === 0xff &&
			isBlockedIpv4(bytesToIpv4(bytes, 12))) ||
		(byte(0) === 0x64 &&
			byte(1) === 0xff &&
			byte(2) === 0x9b &&
			bytes.slice(3, 12).every((byte) => byte === 0) &&
			isBlockedIpv4(bytesToIpv4(bytes, 12))) ||
		(firstWord & 0xfe00) === 0xfc00 ||
		(firstWord & 0xffc0) === 0xfe80 ||
		(firstWord & 0xff00) === 0xff00 ||
		firstWord === 0x2002 ||
		(byte(0) === 0x20 && byte(1) === 0x01 && (byte(2) === 0x00 || byte(2) === 0x0d) && byte(3) === 0xb8)
	);
}

function extractMappedIpv4(address: string): string | null {
	if (!address.includes(".")) return null;
	const candidate = address.slice(address.lastIndexOf(":") + 1);
	return isIP(candidate) === 4 ? candidate : null;
}

function parseIpv6Bytes(address: string): number[] | null {
	if (isIP(address) !== 6) return null;
	const [head = "", tail = ""] = address.split("::", 2);
	const headParts = head ? head.split(":") : [];
	const tailParts = tail ? tail.split(":") : [];
	const missing = 8 - headParts.length - tailParts.length;
	if (missing < 0 || (!address.includes("::") && missing !== 0)) return null;
	const parts = [...headParts, ...Array.from({ length: missing }, () => "0"), ...tailParts];
	if (parts.length !== 8) return null;
	const bytes: number[] = [];
	for (const part of parts) {
		const value = Number.parseInt(part, 16);
		if (!Number.isInteger(value) || value < 0 || value > 0xffff) return null;
		bytes.push(value >> 8, value & 0xff);
	}
	return bytes;
}

function bytesToIpv4(bytes: number[], offset: number): string {
	return `${bytes[offset] ?? 0}.${bytes[offset + 1] ?? 0}.${bytes[offset + 2] ?? 0}.${bytes[offset + 3] ?? 0}`;
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
		(a === 192 && b === 0) ||
		(a === 192 && b === 168)
	);
}
