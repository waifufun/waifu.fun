import { SiweMessage, generateNonce } from "siwe";

import { validateSiweContext, verifySiweMessage } from "./auth-service.js";

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

	return validateSiweContext(input.siwe.message, {
		expectedChainId: 56,
		expectedStatement: input.expectedStatement,
		expectedUriPath: input.expectedUriPath,
	});
}
