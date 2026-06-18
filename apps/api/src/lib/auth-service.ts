import * as jose from "jose";
import { SiweMessage, generateNonce } from "siwe";

// ─── Nonce store (in-memory with TTL) ──────────────────────────────
const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface NonceEntry {
	nonce: string;
	createdAt: number;
}

const nonceStore = new Map<string, NonceEntry>();

// Clean up expired nonces periodically
function pruneExpiredNonces(): void {
	const now = Date.now();
	for (const [key, entry] of nonceStore) {
		if (now - entry.createdAt > NONCE_TTL_MS) {
			nonceStore.delete(key);
		}
	}
}

// Prune every 60 seconds
setInterval(pruneExpiredNonces, 60_000).unref();

export function issueNonce(): string {
	const nonce = generateNonce();
	nonceStore.set(nonce, { nonce, createdAt: Date.now() });
	return nonce;
}

export function consumeNonce(nonce: string): boolean {
	const entry = nonceStore.get(nonce);
	if (!entry) return false;

	const now = Date.now();
	if (now - entry.createdAt > NONCE_TTL_MS) {
		nonceStore.delete(nonce);
		return false;
	}

	nonceStore.delete(nonce);
	return true;
}

// ─── SIWE verification ────────────────────────────────────────────

export interface SiweVerifyResult {
	address: string;
	chainId: number;
	nonce: string;
}

export interface SiweContextOptions {
	allowedHosts?: Iterable<string>;
	expectedChainId?: number;
	expectedStatement?: string;
	expectedUriPath?: string;
	nowMs?: number;
}

export const LEGACY_LOGIN_SIWE_STATEMENT = "Sign in to waifu.fun.";
export const LEGACY_LOGIN_SIWE_URI_PATH = "/auth/siwe";

/**
 * Normalise a hex signature before handing it to siwe/ethers. Some wallet
 * stacks (and a few of our own call paths) end up double-prefixing the hex
 * string, producing values like `0x0x<hex>`. ethers' `recoverAddress` then
 * throws `invalid BytesLike value (argument="signature", value="0x0x...")`
 * and the login silently fails. Collapse any repeated leading `0x` and
 * guarantee a single `0x` prefix.
 */
export function normalizeHexSignature(signature: string): string {
	const trimmed = signature.trim();
	const body = trimmed.replace(/^(?:0x)+/i, "");
	return `0x${body}`;
}

export async function verifySiweMessage(messageStr: string, signature: string): Promise<SiweVerifyResult> {
	const message = new SiweMessage(messageStr);
	const result = await message.verify({ signature: normalizeHexSignature(signature) });

	if (!result.success) {
		throw new Error(result.error?.type ?? "SIWE verification failed");
	}

	return {
		address: result.data.address,
		chainId: result.data.chainId,
		nonce: result.data.nonce,
	};
}

function defaultAllowedHosts(): Set<string> {
	const hosts = new Set(["waifu.fun", "www.waifu.fun"]);
	if (process.env.NODE_ENV !== "production") {
		hosts.add("localhost:3000");
		hosts.add("127.0.0.1:3000");
	}
	for (const value of [process.env.FRONTEND_URL, process.env.NEXT_PUBLIC_HOST, process.env.API_PUBLIC_URL]) {
		if (!value) continue;
		try {
			const host = new URL(value).host;
			if (
				process.env.NODE_ENV !== "production" ||
				(host !== "127.0.0.1" && !host.startsWith("127.0.0.1:") && !host.startsWith("localhost:"))
			) {
				hosts.add(host);
			}
		} catch {
			// Ignore malformed optional env values.
		}
	}
	return hosts;
}

export function validateSiweContext(messageStr: string, options: SiweContextOptions = {}): string | null {
	let parsed: SiweMessage;
	try {
		parsed = new SiweMessage(messageStr);
	} catch {
		return "invalid SIWE message";
	}

	const message = parsed as unknown as {
		domain?: string;
		uri?: string;
		statement?: string;
		chainId?: number;
		expirationTime?: string | Date;
		notBefore?: string | Date;
	};
	const hosts = new Set(options.allowedHosts ?? defaultAllowedHosts());
	const expectedChainId = options.expectedChainId ?? 56;
	const nowMs = options.nowMs ?? Date.now();

	if (!message.domain || !hosts.has(message.domain)) {
		return "SIWE domain is not allowed";
	}
	if (message.chainId !== expectedChainId) {
		return `SIWE chainId must be ${expectedChainId}`;
	}
	if (options.expectedStatement !== undefined && message.statement !== options.expectedStatement) {
		return "SIWE statement is not allowed";
	}
	if (!message.uri) return "SIWE uri is missing";
	try {
		const uri = new URL(message.uri);
		if (!hosts.has(uri.host)) return "SIWE uri host is not allowed";
		if (options.expectedUriPath !== undefined && uri.pathname !== options.expectedUriPath) {
			return "SIWE uri path is not allowed";
		}
	} catch {
		return "SIWE uri is invalid";
	}
	if (message.expirationTime && Date.parse(String(message.expirationTime)) <= nowMs) {
		return "SIWE message expired";
	}
	if (message.notBefore && Date.parse(String(message.notBefore)) > nowMs) {
		return "SIWE message is not valid yet";
	}

	return null;
}

// ─── JWT ───────────────────────────────────────────────────────────

const JWT_ISSUER = "waifu-core";
const JWT_AUDIENCE = "waifu-api";

function getJwtSecret(): Uint8Array {
	const secret = process.env.JWT_SECRET;
	if (!secret || secret.length < 32) {
		throw new Error("JWT_SECRET env var is required and must be at least 32 characters in production");
	}
	return new TextEncoder().encode(secret);
}

export interface JwtPayload {
	address: string;
	role: string;
}

export interface RefreshTokenPayload extends JwtPayload {
	jti: string;
	exp: number;
}

const JWT_REFRESH_AUDIENCE = "waifu-api-refresh";
const REFRESH_TOKEN_USE = "refresh";
const revokedRefreshTokenJtis = new Map<string, number>();

function pruneRevokedRefreshTokenJtis(): void {
	const now = Date.now();
	for (const [jti, expiresAtMs] of revokedRefreshTokenJtis) {
		if (expiresAtMs <= now) revokedRefreshTokenJtis.delete(jti);
	}
}

setInterval(pruneRevokedRefreshTokenJtis, 60_000).unref();

export async function signJwt(payload: JwtPayload, expiresInSeconds: number): Promise<string> {
	const secret = getJwtSecret();

	return new jose.SignJWT({
		address: payload.address,
		role: payload.role,
	})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setIssuer(JWT_ISSUER)
		.setAudience(JWT_AUDIENCE)
		.setExpirationTime(`${expiresInSeconds}s`)
		.sign(secret);
}

export async function verifyJwt(token: string): Promise<JwtPayload> {
	const secret = getJwtSecret();

	const { payload } = await jose.jwtVerify(token, secret, {
		issuer: JWT_ISSUER,
		audience: JWT_AUDIENCE,
	});

	const address = payload.address;
	const role = payload.role;

	if (typeof address !== "string" || typeof role !== "string") {
		throw new Error("Invalid JWT payload: missing address or role");
	}
	if (payload.tokenUse !== undefined && payload.tokenUse !== "access") {
		throw new Error("Invalid JWT payload: token is not an access token");
	}

	return { address, role };
}

export async function signRefreshToken(payload: JwtPayload, expiresInSeconds: number): Promise<string> {
	const secret = getJwtSecret();

	return new jose.SignJWT({
		address: payload.address,
		role: payload.role,
		tokenUse: REFRESH_TOKEN_USE,
	})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setIssuer(JWT_ISSUER)
		.setAudience(JWT_REFRESH_AUDIENCE)
		.setJti(crypto.randomUUID())
		.setExpirationTime(`${expiresInSeconds}s`)
		.sign(secret);
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
	const secret = getJwtSecret();

	const { payload } = await jose.jwtVerify(token, secret, {
		issuer: JWT_ISSUER,
		audience: JWT_REFRESH_AUDIENCE,
	});

	const address = payload.address;
	const role = payload.role;
	const jti = payload.jti;
	const exp = payload.exp;

	if (
		typeof address !== "string" ||
		typeof role !== "string" ||
		typeof jti !== "string" ||
		typeof exp !== "number" ||
		payload.tokenUse !== REFRESH_TOKEN_USE
	) {
		throw new Error("Invalid refresh token payload");
	}
	if (revokedRefreshTokenJtis.get(jti) !== undefined) {
		throw new Error("Refresh token has already been used");
	}

	return { address, role, jti, exp };
}

export function revokeRefreshTokenJti(jti: string, exp: number): void {
	revokedRefreshTokenJtis.set(jti, exp * 1000);
	pruneRevokedRefreshTokenJtis();
}

export function isProductionAuth(): boolean {
	return process.env.NODE_ENV === "production";
}
