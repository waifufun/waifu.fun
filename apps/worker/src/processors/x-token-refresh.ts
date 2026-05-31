import type { Job } from "bullmq";

import { agentEvents, agentXAccounts, getDatabase } from "@waifufun/db";
import { type XTokenRefreshJob, parseJobPayload } from "@waifufun/queue/jobs";
import { and, eq, lt, sql } from "drizzle-orm";

import { decryptEnvelope, encryptEnvelope } from "../lib/envelope.js";
import type { WorkerContext } from "../lib/types.js";

const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const REFRESH_WINDOW_MS = 15 * 60 * 1000;

interface XRefreshTokenResponse {
	access_token: string;
	refresh_token?: string;
	token_type: string;
	expires_in?: number;
	scope?: string;
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

export function createXTokenRefreshProcessor(context: WorkerContext) {
	return async (job: Job<XTokenRefreshJob>) => {
		const payload = parseJobPayload("x-token-refresh", job.data);
		const db = getDatabase().db;
		const refreshBefore = new Date(Date.now() + REFRESH_WINDOW_MS);

		const accounts = await db
			.select()
			.from(agentXAccounts)
			.where(
				and(
					lt(agentXAccounts.tokenExpiresAt, refreshBefore),
					sql`${agentXAccounts.encryptedRefreshToken} IS NOT NULL`,
					sql`CAST(${agentXAccounts.refreshFailureCount} AS INTEGER) < 5`,
				),
			)
			.limit(payload.limit);

		let refreshed = 0;
		let failed = 0;

		for (const account of accounts) {
			if (!account.encryptedRefreshToken) continue;
			const previousFailureCount = Number.parseInt(account.refreshFailureCount ?? "0", 10) || 0;

			try {
				const refreshToken = decryptEnvelope(account.encryptedRefreshToken);
				const tokenData = await refreshXToken(refreshToken);
				const now = new Date();
				const tokenExpiresAt = tokenData.expires_in
					? new Date(now.getTime() + tokenData.expires_in * 1000)
					: account.tokenExpiresAt;

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

				refreshed += 1;
			} catch (error) {
				failed += 1;
				const failureCount = previousFailureCount + 1;
				const now = new Date();
				await db
					.update(agentXAccounts)
					.set({
						refreshFailureCount: String(failureCount),
						updatedAt: now,
					})
					.where(eq(agentXAccounts.id, account.id));

				context.logger.warn(
					{
						jobId: job.id,
						agentId: account.agentId,
						xUserId: account.xUserId,
						failureCount,
						error: error instanceof Error ? error.message : String(error),
					},
					"agent X token refresh failed",
				);

				if (failureCount >= 5) {
					await db.insert(agentEvents).values({
						agentId: account.agentId,
						eventType: "x.token.refresh_exhausted",
						type: "x.token.refresh_exhausted",
						data: {
							agentId: account.agentId,
							xUserId: account.xUserId,
							xHandle: account.xHandle,
							failureCount,
							lastError: error instanceof Error ? error.message : String(error),
						},
						payload: {
							agentId: account.agentId,
							xUserId: account.xUserId,
							xHandle: account.xHandle,
							failureCount,
							lastError: error instanceof Error ? error.message : String(error),
						},
						source: "x-token-refresh",
						sourceEventId: `x-token-refresh:${account.agentId}:${Date.now()}`,
						status: "pending",
					});
				}
			}
		}

		context.logger.info(
			{
				jobId: job.id,
				scanned: accounts.length,
				refreshed,
				failed,
			},
			"agent X token refresh completed",
		);

		return { status: "completed", scanned: accounts.length, refreshed, failed };
	};
}
