import { agentXAccounts, getDatabase } from "@waifufun/db";
import { eq } from "drizzle-orm";

import { decryptEnvelope, encryptEnvelope } from "../../lib/crypto/envelope.js";

const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const X_API_BASE_URL = "https://api.twitter.com/2";
const INLINE_REFRESH_WINDOW_MS = 5 * 60 * 1000;

interface XRefreshTokenResponse {
	access_token: string;
	refresh_token?: string;
	token_type: string;
	expires_in?: number;
	scope?: string;
}

export interface XClient {
	postTweet(text: string): Promise<{ id: string }>;
	deleteTweet(id: string): Promise<void>;
}

async function refreshXToken(refreshToken: string): Promise<XRefreshTokenResponse> {
	const clientId = process.env.X_CLIENT_ID;
	const clientSecret = process.env.X_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		throw new Error("X_CLIENT_ID and X_CLIENT_SECRET are required for X token refresh");
	}

	const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
	const body = new URLSearchParams({
		grant_type: "refresh_token",
		refresh_token: refreshToken,
		client_id: clientId,
	});

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
		throw new Error(`X token refresh failed (${res.status}): ${text}`);
	}

	return res.json() as Promise<XRefreshTokenResponse>;
}

function isNearExpiry(expiresAt: Date | null): boolean {
	if (!expiresAt) return false;
	return expiresAt.getTime() <= Date.now() + INLINE_REFRESH_WINDOW_MS;
}

async function requestX<T>(accessToken: string, path: string, init: RequestInit): Promise<T> {
	const res = await fetch(`${X_API_BASE_URL}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
			...init.headers,
		},
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`X API request failed (${res.status}): ${text}`);
	}

	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

export async function getAgentXClient(agentId: string): Promise<XClient | null> {
	const db = getDatabase().db;
	const [account] = await db.select().from(agentXAccounts).where(eq(agentXAccounts.agentId, agentId)).limit(1);

	if (!account) return null;

	let accessToken = decryptEnvelope(account.encryptedAccessToken);

	if (isNearExpiry(account.tokenExpiresAt) && account.encryptedRefreshToken) {
		const refreshToken = decryptEnvelope(account.encryptedRefreshToken);
		const tokenData = await refreshXToken(refreshToken);
		const now = new Date();
		const tokenExpiresAt = tokenData.expires_in
			? new Date(now.getTime() + tokenData.expires_in * 1000)
			: account.tokenExpiresAt;

		accessToken = tokenData.access_token;

		await db
			.update(agentXAccounts)
			.set({
				encryptedAccessToken: encryptEnvelope(tokenData.access_token),
				encryptedRefreshToken: tokenData.refresh_token
					? encryptEnvelope(tokenData.refresh_token)
					: account.encryptedRefreshToken,
				scope: tokenData.scope ?? account.scope,
				tokenExpiresAt,
				lastRefreshedAt: now,
				refreshFailureCount: "0",
				updatedAt: now,
			})
			.where(eq(agentXAccounts.id, account.id));
	}

	return {
		async postTweet(text: string): Promise<{ id: string }> {
			const json = await requestX<{ data: { id: string; text: string } }>(accessToken, "/tweets", {
				method: "POST",
				body: JSON.stringify({ text }),
			});
			return { id: json.data.id };
		},

		async deleteTweet(id: string): Promise<void> {
			await requestX<unknown>(accessToken, `/tweets/${encodeURIComponent(id)}`, {
				method: "DELETE",
			});
		},
	};
}
