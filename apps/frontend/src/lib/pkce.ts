/**
 * PKCE (RFC 7636) helpers for the browser.
 *
 * Steward's OAuth authorize endpoint now REQUIRES PKCE for
 * `response_type=code` (the implicit `response_type=token` flow was disabled
 * because it leaks tokens in URLs). Any client-driven Authorization Code flow
 * against Steward must:
 *   1. generate a random `code_verifier`
 *   2. send `code_challenge = base64url(SHA-256(code_verifier))` +
 *      `code_challenge_method=S256` on the authorize request
 *   3. send the original `code_verifier` on the code→token exchange
 *
 * These helpers run in the browser with Web Crypto (`crypto.subtle`), so they
 * are safe for the static-export client bundle (no Node-only APIs).
 */

const VERIFIER_BYTES = 32; // → 43-char base64url verifier (within the 43-128 range)

/** base64url-encode raw bytes (no padding, URL-safe alphabet). */
function base64UrlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i] as number);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function getCrypto(): Crypto {
	if (typeof globalThis === "undefined" || !globalThis.crypto?.subtle) {
		throw new Error("Web Crypto (crypto.subtle) is unavailable in this environment");
	}
	return globalThis.crypto;
}

/** Generate a cryptographically random PKCE `code_verifier` (base64url, 43 chars). */
export function generateCodeVerifier(): string {
	const bytes = new Uint8Array(VERIFIER_BYTES);
	getCrypto().getRandomValues(bytes);
	return base64UrlEncode(bytes);
}

/**
 * Derive the S256 `code_challenge` for a given verifier:
 * base64url(SHA-256(ASCII(verifier))). Async because `crypto.subtle.digest`
 * is async.
 */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
	const data = new TextEncoder().encode(verifier);
	const digest = await getCrypto().subtle.digest("SHA-256", data);
	return base64UrlEncode(new Uint8Array(digest));
}

/** Generate an opaque CSRF `state` token (base64url, 43 chars). */
export function generateState(): string {
	const bytes = new Uint8Array(VERIFIER_BYTES);
	getCrypto().getRandomValues(bytes);
	return base64UrlEncode(bytes);
}

export interface PkcePair {
	codeVerifier: string;
	codeChallenge: string;
	codeChallengeMethod: "S256";
}

/** Generate a full PKCE pair (verifier + S256 challenge). */
export async function generatePkcePair(): Promise<PkcePair> {
	const codeVerifier = generateCodeVerifier();
	const codeChallenge = await deriveCodeChallenge(codeVerifier);
	return { codeVerifier, codeChallenge, codeChallengeMethod: "S256" };
}

// ─── sessionStorage stash for the authorize → callback round-trip ──────────

const VERIFIER_KEY = "waifu-steward-pkce-verifier";
const STATE_KEY = "waifu-steward-pkce-state";

export function stashPkce(verifier: string, state: string): void {
	if (typeof window === "undefined") return;
	try {
		window.sessionStorage.setItem(VERIFIER_KEY, verifier);
		window.sessionStorage.setItem(STATE_KEY, state);
	} catch {
		// sessionStorage can throw in private mode / quota; the callback will
		// surface a clear "missing verifier" error rather than silently break.
	}
}

export function readStashedPkce(): { verifier: string | null; state: string | null } {
	if (typeof window === "undefined") return { verifier: null, state: null };
	try {
		return {
			verifier: window.sessionStorage.getItem(VERIFIER_KEY),
			state: window.sessionStorage.getItem(STATE_KEY),
		};
	} catch {
		return { verifier: null, state: null };
	}
}

export function clearStashedPkce(): void {
	if (typeof window === "undefined") return;
	try {
		window.sessionStorage.removeItem(VERIFIER_KEY);
		window.sessionStorage.removeItem(STATE_KEY);
	} catch {
		// ignore
	}
}
