/**
 * Internal (admin-authed) trigger for the autonomous BNB->credits auto-mint loop.
 *
 * POST /v2/internal/credits-offramp/tick   (Bearer ADMIN_API_KEY)
 *   Runs ONE CreditsAutoMinter tick: scan the Eliza Cloud directWallet receive
 *   address for new inbound BNB, gate each deposit against the per-tx/per-day
 *   caps + kill-switch, and auto-mint the allowed ones. Returns a summary.
 *
 * GET  /v2/internal/credits-offramp/status (Bearer ADMIN_API_KEY)
 *   Read-only: today's auto-mint spend, the resolved caps, kill-switch state,
 *   and whether the off-ramp is automatable. For dashboards/ops.
 *
 * Designed to be driven by an EXTERNAL cron (Railway/GitHub Actions) hitting the
 * tick route every few minutes, matching the rest of waifu-core's cron pattern
 * (no in-process scheduler). Idempotent + capped, so re-runs are safe.
 */

import { Hono } from "hono";

import { getDatabase } from "@waifufun/db/client";

import { constantTimeEqual } from "../../../lib/agent-keys.js";
import { CreditsAutoMinter } from "../../../services/credits-offramp/auto-mint.js";
import type { OffRampElizaClient } from "../../../services/credits-offramp/index.js";
import { resolveOffRampLimits } from "../../../services/credits-offramp/limits.js";
import { sumSpentTodayUsd } from "../../../services/credits-offramp/mint-ledger.js";
import {
	createElizaCloudClient,
	resolveElizaCloudApiKey,
	resolveElizaCloudPlatformStewardUserId,
	resolveElizaCloudSessionToken,
	resolveElizaCloudStewardSecret,
} from "../../../services/eliza-client.js";

const app = new Hono();

// Admin bearer auth on every route here (same pattern as /v2/admin/agents).
app.use("*", async (c, next) => {
	const authHeader = c.req.header("authorization");
	if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
		return c.json({ ok: false, error: "UNAUTHORIZED", message: "Admin bearer token required" }, 401);
	}
	const expected = process.env.ADMIN_API_KEY;
	const got = authHeader.slice(7).trim();
	if (!expected || expected.length === 0 || !constantTimeEqual(got, expected)) {
		return c.json({ ok: false, error: "FORBIDDEN", message: "Invalid admin bearer token" }, 403);
	}
	await next();
});

function buildElizaClient(): OffRampElizaClient & {
	getCreditBalance?: (agentId?: string) => Promise<{ balance: number }>;
} {
	const baseUrl = process.env.ELIZA_CLOUD_BASE_URL ?? process.env.ELIZA_API_URL ?? "https://api.elizacloud.ai";
	const client = createElizaCloudClient({
		baseUrl,
		apiKey: resolveElizaCloudApiKey() ?? "",
		serviceKey: process.env.ELIZA_CLOUD_SERVICE_KEY ?? process.env.ELIZA_SERVICE_KEY ?? "",
		sessionToken: resolveElizaCloudSessionToken() ?? "",
		stewardSessionSecret: resolveElizaCloudStewardSecret() ?? "",
		platformStewardUserId: resolveElizaCloudPlatformStewardUserId() ?? "",
		platformStewardTenantId: process.env.ELIZA_CLOUD_PLATFORM_STEWARD_TENANT_ID ?? "",
		logger: console,
		resilient: true,
	});
	return client as unknown as OffRampElizaClient & {
		getCreditBalance?: (agentId?: string) => Promise<{ balance: number }>;
	};
}

app.post("/tick", async (c) => {
	const db = getDatabase().db;
	const eliza = buildElizaClient();
	const minter = new CreditsAutoMinter(db, eliza);
	try {
		const summary = await minter.tick();
		return c.json({ ok: true, data: summary });
	} catch (err) {
		return c.json(
			{ ok: false, error: "AUTOMINT_TICK_FAILED", detail: err instanceof Error ? err.message : String(err) },
			502,
		);
	}
});

app.get("/status", async (c) => {
	const db = getDatabase().db;
	const limits = resolveOffRampLimits();
	const eliza = buildElizaClient();
	let spentTodayUsd = 0;
	try {
		spentTodayUsd = await sumSpentTodayUsd(db);
	} catch {
		/* status is best-effort */
	}
	return c.json({
		ok: true,
		data: {
			autoEnabled: limits.autoEnabled,
			pauseFilePath: limits.pauseFilePath,
			maxPerTxUsd: limits.maxPerTxUsd,
			maxPerDayUsd: limits.maxPerDayUsd,
			minPerTxUsd: limits.minPerTxUsd,
			spentTodayUsd,
			remainingTodayUsd: Number((limits.maxPerDayUsd - spentTodayUsd).toFixed(2)),
			automatable: eliza.hasCryptoSession(),
		},
	});
});

export default app;
