/**
 * twitter-oauth.ts
 * Pure Node.js implementation of X (Twitter) OAuth 2.0 with PKCE.
 * No third-party OAuth libraries — just node:crypto + fetch.
 */

import { createHash, randomBytes } from "node:crypto";

// ── Env helpers ──────────────────────────────────────────────────────────────

export function getTwitterOAuthConfig(opts: { redirectUriEnv?: string; defaultRedirectUri?: string } = {}) {
	const clientId = process.env.X_CLIENT_ID;
	const clientSecret = process.env.X_CLIENT_SECRET;
	const redirectUri =
		process.env[opts.redirectUriEnv ?? "X_REDIRECT_URI"] ??
		opts.defaultRedirectUri ??
		"https://api.waifu.fun/auth/twitter/callback";

	if (!clientId || !clientSecret) {
		// Return null — routes will return 501 until configured
		return null;
	}

	return { clientId, clientSecret, redirectUri };
}

// ── PKCE helpers ─────────────────────────────────────────────────────────────

/** Generate a cryptographically random code verifier (43–128 chars, base64url). */
export function generateCodeVerifier(): string {
	return randomBytes(32).toString("base64url");
}

/** Derive S256 code_challenge from verifier. */
export function deriveCodeChallenge(verifier: string): string {
	return createHash("sha256").update(verifier).digest("base64url");
}

/** Generate opaque state token (32 bytes hex). */
export function generateState(): string {
	return randomBytes(32).toString("hex");
}

// ── Auth URL ─────────────────────────────────────────────────────────────────

const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";

const REQUIRED_SCOPES = ["tweet.read", "users.read"];
export const AGENT_X_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"] as const;

export function buildAuthorizationUrl(opts: {
	clientId: string;
	redirectUri: string;
	state: string;
	codeChallenge: string;
	scopes?: readonly string[];
}): string {
	const params = new URLSearchParams({
		response_type: "code",
		client_id: opts.clientId,
		redirect_uri: opts.redirectUri,
		scope: (opts.scopes ?? REQUIRED_SCOPES).join(" "),
		state: opts.state,
		code_challenge: opts.codeChallenge,
		code_challenge_method: "S256",
	});

	return `${X_AUTHORIZE_URL}?${params.toString()}`;
}

// ── Token exchange ────────────────────────────────────────────────────────────

const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";

export interface XTokenResponse {
	access_token: string;
	token_type: string;
	expires_in?: number;
	scope?: string;
	refresh_token?: string;
}

export async function exchangeCodeForToken(opts: {
	code: string;
	codeVerifier: string;
	redirectUri: string;
	clientId: string;
	clientSecret: string;
}): Promise<XTokenResponse> {
	const body = new URLSearchParams({
		grant_type: "authorization_code",
		code: opts.code,
		redirect_uri: opts.redirectUri,
		code_verifier: opts.codeVerifier,
		client_id: opts.clientId,
	});

	// X requires Basic auth for confidential clients
	const credentials = Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString("base64");

	const res = await fetch(X_TOKEN_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Authorization: `Basic ${credentials}`,
		},
		body: body.toString(),
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`X token exchange failed (${res.status}): ${text}`);
	}

	return res.json() as Promise<XTokenResponse>;
}

// ── User fetch ────────────────────────────────────────────────────────────────

const X_USER_URL = "https://api.x.com/2/users/me?user.fields=id,name,username,profile_image_url";

export interface XUser {
	id: string;
	name: string;
	username: string;
	profile_image_url?: string;
}

export async function fetchXUser(accessToken: string): Promise<XUser> {
	const res = await fetch(X_USER_URL, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`X user fetch failed (${res.status}): ${text}`);
	}

	const json = (await res.json()) as { data: XUser };
	return json.data;
}
