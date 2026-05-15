import { SiweMessage, generateNonce } from "siwe";

import { verifySiweMessage } from "./auth-service.js";

type NonceEntry = {
	nonce: string;
	expiresAt: number;
};

const NONCE_TTL_MS = 10 * 60 * 1000;
const nonces = new Map<string, NonceEntry>();

function pruneExpiredNonces(now = Date.now()): void {
	for (const [key, entry] of nonces) {
		if (entry.expiresAt <= now) nonces.delete(key);
	}
}

function nonceKey(patronId: string, purpose: string, address: string): string {
	return `${purpose}:${patronId}:${address.toLowerCase()}`;
}

export function issueRequestSiweNonce(patronId: string, purpose: string, address: string): string {
	const now = Date.now();
	pruneExpiredNonces(now);
	const nonce = generateNonce();
	nonces.set(nonceKey(patronId, purpose, address), { nonce, expiresAt: now + NONCE_TTL_MS });
	return nonce;
}

export function clearRequestSiweNoncesForTest(): void {
	nonces.clear();
}

function consumeRequestSiweNonce(patronId: string, purpose: string, address: string, nonce: string): boolean {
	pruneExpiredNonces();
	const key = nonceKey(patronId, purpose, address);
	const entry = nonces.get(key);
	if (!entry) return false;
	if (entry.nonce !== nonce) return false;
	if (Date.now() > entry.expiresAt) {
		nonces.delete(key);
		return false;
	}
	nonces.delete(key);
	return true;
}

function allowedHosts(): Set<string> {
	const hosts = new Set(["waifu.fun", "www.waifu.fun", "localhost:3000", "127.0.0.1:3000"]);
	for (const value of [process.env.FRONTEND_URL, process.env.NEXT_PUBLIC_HOST, process.env.API_PUBLIC_URL]) {
		if (!value) continue;
		try {
			hosts.add(new URL(value).host);
		} catch {
			// ignore malformed optional env values
		}
	}
	return hosts;
}

export type RequestSiweProof = {
	message: string;
	signature: string;
};

export type RequestSiweValidation = {
	patronId: string;
	purpose: string;
	creator: `0x${string}`;
	siwe: RequestSiweProof;
	expectedStatement: string;
	expectedUriPath: string;
	verifier?: typeof verifySiweMessage;
};

export async function validateRequestSiwe(input: RequestSiweValidation): Promise<string | null> {
	let parsed: SiweMessage;
	try {
		parsed = new SiweMessage(input.siwe.message);
	} catch {
		return "invalid SIWE message";
	}

	let verified: Awaited<ReturnType<typeof verifySiweMessage>>;
	try {
		verified = await (input.verifier ?? verifySiweMessage)(input.siwe.message, input.siwe.signature);
	} catch {
		return "could not verify creator signature";
	}

	const address = verified.address.toLowerCase();
	if (address !== input.creator.toLowerCase()) {
		return "creator signature does not match creator address";
	}
	if (verified.chainId !== 56) {
		return "SIWE chainId must be 56";
	}
	if (!consumeRequestSiweNonce(input.patronId, input.purpose, address, verified.nonce)) {
		return "nonce mismatch or expired";
	}

	const message = parsed as unknown as {
		domain?: string;
		uri?: string;
		statement?: string;
		expirationTime?: string | Date;
	};
	if (!message.domain || !allowedHosts().has(message.domain)) {
		return "SIWE domain is not allowed";
	}
	if (message.statement !== input.expectedStatement) {
		return "SIWE statement is not allowed";
	}
	if (!message.uri) return "SIWE uri is missing";
	try {
		const uri = new URL(message.uri);
		if (!allowedHosts().has(uri.host) || uri.pathname !== input.expectedUriPath) {
			return "SIWE uri is not allowed";
		}
	} catch {
		return "SIWE uri is invalid";
	}
	if (message.expirationTime && Date.parse(String(message.expirationTime)) <= Date.now()) {
		return "SIWE message expired";
	}

	return null;
}
