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

export async function verifySiweMessage(messageStr: string, signature: string): Promise<SiweVerifyResult> {
	const message = new SiweMessage(messageStr);
	const result = await message.verify({ signature });

	if (!result.success) {
		throw new Error(result.error?.type ?? "SIWE verification failed");
	}

	return {
		address: result.data.address,
		chainId: result.data.chainId,
		nonce: result.data.nonce,
	};
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

	return { address, role };
}

export function isProductionAuth(): boolean {
	return process.env.NODE_ENV === "production";
}
