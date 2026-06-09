/**
 * Credits off-ramp routes: turn on-chain BNB into Eliza Cloud credits.
 *
 * GET  /v2/agents/:address/credits-offramp/quote?usd=...
 *   Public read. Returns the live BSC directWallet receive address, the BNB
 *   amount to send for a given USD top-up, the price snapshot, and whether
 *   waifu-core can execute the conversion automatically (a platform session
 *   token is configured) or only via manual instructions.
 *
 * POST /v2/agents/:address/credits-offramp/convert   (patron + ownership)
 *   Body: { usd: number, transactionHash: string }
 *   Runs the REAL directWallet create+confirm against Eliza Cloud when a
 *   platform session token is configured AND a real BSC tx hash for the BNB
 *   transfer is supplied. Otherwise returns honest manual instructions
 *   (automatable:false) — never a fake mint. On confirmed payment Eliza Cloud
 *   fires credits.topped_up, which is the sole dormancy-clearer.
 *
 * HONESTY: credits are ORG-LEVEL on Eliza Cloud (all hosted agents share one
 * platform credit pool). This endpoint funds that shared pool against an
 * on-chain BNB receipt; per-agent dormancy is cleared by the webhook, not here.
 */

import { Hono } from "hono";

import { CreditsOffRamp, type OffRampElizaClient } from "../../../services/credits-offramp/index.js";
import {
	createElizaCloudClient,
	resolveElizaCloudApiKey,
	resolveElizaCloudPlatformStewardUserId,
	resolveElizaCloudSessionToken,
	resolveElizaCloudStewardSecret,
} from "../../../services/eliza-client.js";
import { ElizaCryptoNotAutomatableError } from "../../../services/eliza-client.js";

const app = new Hono();

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function buildOffRamp(): CreditsOffRamp {
	const baseUrl = process.env.ELIZA_CLOUD_BASE_URL ?? process.env.ELIZA_API_URL ?? "https://api.elizacloud.ai";
	const apiKey = resolveElizaCloudApiKey() ?? "";
	const serviceKey = process.env.ELIZA_CLOUD_SERVICE_KEY ?? process.env.ELIZA_SERVICE_KEY ?? "";
	const sessionToken = resolveElizaCloudSessionToken() ?? "";
	const stewardSessionSecret = resolveElizaCloudStewardSecret() ?? "";
	const platformStewardUserId = resolveElizaCloudPlatformStewardUserId() ?? "";
	const platformStewardTenantId = process.env.ELIZA_CLOUD_PLATFORM_STEWARD_TENANT_ID ?? "";
	const client = createElizaCloudClient({
		baseUrl,
		apiKey,
		serviceKey,
		sessionToken,
		stewardSessionSecret,
		platformStewardUserId,
		platformStewardTenantId,
		logger: console,
	});
	// The off-ramp only needs the crypto methods; the full client implements them.
	return new CreditsOffRamp(client as unknown as OffRampElizaClient);
}

function parseUsd(raw: string | undefined): number | null {
	if (!raw) return null;
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : null;
}

app.get("/:address/credits-offramp/quote", async (c) => {
	const address = c.req.param("address").toLowerCase();
	if (!ADDRESS_RE.test(address)) {
		return c.json({ ok: false, error: "INVALID_ADDRESS", message: "invalid agent token address" }, 400);
	}
	const usd = parseUsd(c.req.query("usd"));
	if (usd === null) {
		return c.json({ ok: false, error: "INVALID_USD", message: "usd query param must be a positive number" }, 400);
	}
	try {
		const quote = await buildOffRamp().quoteUsd(usd);
		return c.json({ ok: true, data: quote });
	} catch (err) {
		return c.json(
			{ ok: false, error: "OFFRAMP_QUOTE_FAILED", detail: err instanceof Error ? err.message : String(err) },
			502,
		);
	}
});

export default app;

/**
 * The patron-gated convert handler is registered on the main agents router
 * (which owns the patron middleware + :id ownership resolution). Exported here
 * so agents.ts can mount it without duplicating the off-ramp wiring.
 */
export async function handleOffRampConvert(input: {
	usd: unknown;
	transactionHash: unknown;
}): Promise<{ status: 200; body: unknown } | { status: 400; body: unknown } | { status: 502; body: unknown }> {
	const usd = typeof input.usd === "number" && Number.isFinite(input.usd) && input.usd > 0 ? input.usd : null;
	if (usd === null) {
		return { status: 400, body: { ok: false, error: "INVALID_USD", message: "usd must be a positive number" } };
	}
	const transactionHash = typeof input.transactionHash === "string" ? input.transactionHash : "";
	const offRamp = buildOffRamp();
	try {
		const result = await offRamp.convert({ usd, transactionHash });
		// Discriminated: either a real conversion or honest manual instructions.
		return { status: 200, body: { ok: true, data: result } };
	} catch (err) {
		if (err instanceof ElizaCryptoNotAutomatableError) {
			// Defensive: convert() normally returns manual instructions instead of
			// throwing, but surface a clean 200 with manual guidance if it does.
			try {
				const manual = await offRamp.manualInstructions(usd, err.message);
				return { status: 200, body: { ok: true, data: manual } };
			} catch {
				/* fall through to error */
			}
		}
		if (err instanceof Error && err.message.includes("transactionHash must be")) {
			return { status: 400, body: { ok: false, error: "INVALID_TX_HASH", message: err.message } };
		}
		return {
			status: 502,
			body: { ok: false, error: "OFFRAMP_CONVERT_FAILED", detail: err instanceof Error ? err.message : String(err) },
		};
	}
}
