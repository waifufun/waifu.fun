/**
 * Claim flow routes (v3 pivot).
 *
 *   POST /v2/agents/prepare              → agent-auth'd. Agents call this
 *                                          when they've decided to launch.
 *                                          We run steps 1-4 (wallet, identity,
 *                                          four.meme login/upload/create),
 *                                          cache (createArg, signature), mint
 *                                          a claim token (raw), return
 *                                          claim_url + expiry.
 *
 *   GET  /v2/agents/claim/:token         → public. Returns agent card data
 *                                          for the /claim/[token] frontend
 *                                          page. 410 if claim expired.
 *
 *   POST /v2/agents/claim/:token         → requires patron session (X
 *                                          OAuth cookie). Attributes the
 *                                          claim to the patron's X handle.
 *
 *   POST /v2/agents/claim/:token/launch  → requires patron session. Runs
 *                                          the on-chain broadcast using the
 *                                          cached (createArg, signature).
 *                                          Accepts optional fundTxHash the
 *                                          patron already sent.
 *
 * The raw claim token is generated server-side (32 random bytes, base64url),
 * shown to the agent ONCE in the /prepare response. The DB only holds its
 * sha256. The claim URL that the agent shares with its human is:
 *   https://waifu.fun/claim/{rawToken}
 */

import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";

import { agentPersonaQueries, agentPersonas, agentWallets, getDatabase } from "@waifufun/db";
import type { Database } from "@waifufun/db";
import { eq } from "drizzle-orm";

import { isLegacyClaimEnabled } from "../../lib/feature-flags.js";
import { ensureAgentIdMatches, requireAgentAuth } from "../../middleware/agent-auth.js";
import { attachPatronUser, requirePatronAuth } from "../../middleware/human-auth.js";

import { seedDefaultAdapterPolicies } from "../../services/agent-launch/default-adapter-policies.js";
import {
	AgentLaunchError,
	type AgentLaunchInput,
	FourMemeError,
	type OrchestratorDeps,
	type PersonaStore,
	createOrchestrator,
	createStewardClient,
} from "../../services/agent-launch/index.js";
import { emitAgentEvent } from "../../services/events/emit.js";
import { provisionClaimedAgent } from "../../services/provisioning.js";

const app = new Hono();

const CLAIM_DEPRECATED_RESPONSE = {
	error: "deprecated",
	message: "claim flow has been removed in v3. provision agents via /v2/launches/:id/authorize",
	docs: "https://docs.waifu.fun/v3/migration",
};

app.use("/prepare", async (c, next) => {
	if (!isLegacyClaimEnabled()) {
		return c.json(CLAIM_DEPRECATED_RESPONSE, 410);
	}
	await next();
});

app.use("/claim/*", async (c, next) => {
	if (!isLegacyClaimEnabled()) {
		return c.json(CLAIM_DEPRECATED_RESPONSE, 410);
	}
	await next();
});

// Claim tokens expire after this window unless claimed.
const DEFAULT_CLAIM_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

function hashToken(raw: string): string {
	return createHash("sha256").update(raw).digest("hex");
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(data: Record<string, unknown>, key: string): string | null {
	const value = data[key];
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function mintRawToken(): string {
	// 32 random bytes → ~43 chars of base64url. Plenty of entropy.
	return randomBytes(32).toString("base64url");
}

interface TaxSplitPatch {
	agentBps: number;
	patronBps: number;
}

const DEFAULT_TAX_SPLIT: TaxSplitPatch = { agentBps: 8000, patronBps: 2000 };

function parseTaxSplit(input: unknown): TaxSplitPatch | { error: string } {
	if (input === undefined || input === null) return DEFAULT_TAX_SPLIT;
	if (typeof input !== "object") return { error: "taxSplit must be an object" };
	const candidate = input as { agentBps?: unknown; patronBps?: unknown };
	if (!Number.isInteger(candidate.agentBps) || !Number.isInteger(candidate.patronBps)) {
		return { error: "taxSplit.agentBps and taxSplit.patronBps must be integers" };
	}
	const agentBps = candidate.agentBps as number;
	const patronBps = candidate.patronBps as number;
	if (agentBps <= 0 || patronBps <= 0) {
		return { error: "taxSplit.agentBps and taxSplit.patronBps must both be > 0" };
	}
	if (agentBps + patronBps !== 10000) {
		return { error: "taxSplit.agentBps + taxSplit.patronBps must equal 10000" };
	}
	return { agentBps, patronBps };
}

function isTaxSplitPatch(value: TaxSplitPatch | { error: string }): value is TaxSplitPatch {
	return !("error" in value);
}

export function buildClaimLaunchAdminWallets(persona: { ownerAddress?: string | null }): string[] {
	return persona.ownerAddress ? [persona.ownerAddress] : [];
}

function requireDb(): ReturnType<typeof getDatabase>["db"] | null {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

function buildOrchestratorDeps(): OrchestratorDeps {
	const chainId = Number(process.env.FOURMEME_CHAIN_ID ?? 56);
	if (chainId !== 56 && chainId !== 97) {
		throw new Error("FOURMEME_CHAIN_ID must be 56 or 97");
	}
	const rpcUrl =
		process.env.BSC_RPC_URL ??
		(chainId === 56 ? "https://bsc-dataseed.binance.org" : "https://data-seed-prebsc-1-s1.binance.org:8545");
	const stewardBaseUrl = process.env.STEWARD_API_URL;
	const stewardApiKey = process.env.STEWARD_API_KEY;
	if (!stewardBaseUrl || !stewardApiKey) {
		throw new Error("STEWARD_API_URL and STEWARD_API_KEY env vars required");
	}
	const stewardTenantId = process.env.STEWARD_TENANT_ID ?? "waifu";
	const steward = createStewardClient({
		baseUrl: stewardBaseUrl,
		apiKey: stewardApiKey,
		tenantId: stewardTenantId,
	});
	let personaStore: PersonaStore | undefined;
	if (process.env.DATABASE_URL && process.env.DATABASE_URL.length > 0) {
		const { db } = getDatabase(process.env.DATABASE_URL);
		personaStore = {
			writeInitial: async (args) => {
				const existing = await agentPersonaQueries.getAgentPersonaByAgentId(db, args.agentId);
				const personaJson =
					args.persona && typeof args.persona === "object" ? (args.persona as Record<string, unknown>) : undefined;
				if (!existing) {
					const preset = personaJson && typeof personaJson.preset === "string" ? (personaJson.preset as string) : null;
					const systemPrompt =
						personaJson && typeof personaJson.systemPrompt === "string" ? (personaJson.systemPrompt as string) : null;
					const traits =
						personaJson && Array.isArray(personaJson.traits)
							? (personaJson.traits.filter((t: unknown) => typeof t === "string") as string[])
							: [];
					const twitterHandle =
						personaJson && typeof personaJson.twitterHandle === "string" ? (personaJson.twitterHandle as string) : null;
					const persona = await agentPersonaQueries.createAgentPersona(db, {
						agentId: args.agentId,
						name: args.name,
						bio: args.bio ?? null,
						avatarUrl: args.avatarUrl ?? null,
						preset,
						systemPrompt,
						traits,
						twitterHandle,
						metadata: personaJson ?? null,
					});
					await seedDefaultAdapterPolicies(db, persona);
				}
				await upsertClaimAgentWallet(db, {
					agentId: args.agentId,
					walletAddress: args.walletAddress,
					safeAddress: args.taxVaultAddress ?? null,
					persona: personaJson ?? null,
					stewardTenantId,
				});
			},
			setToken: async (agentId, tokenAddress) => {
				await agentPersonaQueries.setTokenAddressOnPersona(db, agentId, tokenAddress);
				await db
					.update(agentWallets)
					.set({ agentToken: tokenAddress, updatedAt: new Date() })
					.where(eq(agentWallets.internalAgentId, agentId));
			},
			setIdentity: async (agentId, identity) => {
				await agentPersonaQueries.setPersonaIdentity(db, agentId, identity);
			},
		};
	}
	return {
		steward,
		rpcUrl,
		chainId: chainId as 56 | 97,
		...(process.env.FOURMEME_API_URL ? { fourMemeBaseUrl: process.env.FOURMEME_API_URL } : {}),
		...(process.env.FOURMEME_TOKEN_MANAGER_2
			? { tokenManager2Address: process.env.FOURMEME_TOKEN_MANAGER_2 as `0x${string}` }
			: {}),
		...(process.env.EIP8004_NFT_ADDRESS ? { eip8004NftAddress: process.env.EIP8004_NFT_ADDRESS as `0x${string}` } : {}),
		...(process.env.TAX_SPLITTER_FACTORY_ADDRESS
			? { taxSplitterFactoryAddress: process.env.TAX_SPLITTER_FACTORY_ADDRESS as `0x${string}` }
			: {}),
		platformSlug: "waifu",
		...(personaStore ? { personaStore } : {}),
	};
}

async function upsertClaimAgentWallet(
	db: Database,
	args: {
		agentId: string;
		walletAddress: string;
		safeAddress: string | null;
		persona: Record<string, unknown> | null;
		stewardTenantId: string;
	},
): Promise<void> {
	const [existing] = await db
		.select({ id: agentWallets.id })
		.from(agentWallets)
		.where(eq(agentWallets.internalAgentId, args.agentId))
		.limit(1);

	const now = new Date();
	const values = {
		walletAddress: args.walletAddress,
		safeAddress: args.safeAddress,
		internalAgentId: args.agentId,
		stewardAgentId: args.agentId,
		stewardTenantId: args.stewardTenantId,
		persona: args.persona,
		updatedAt: now,
	};

	if (existing) {
		await db.update(agentWallets).set(values).where(eq(agentWallets.id, existing.id));
		return;
	}

	await db.insert(agentWallets).values({
		...values,
		createdAt: now,
	});
}

/**
 * POST /v2/agents/prepare
 *
 * Agent-auth'd. Runs the pre-broadcast half of the launch and mints a
 * one-time claim token the agent can share with its human patron.
 *
 * Body is identical to /v2/agents/launch (AgentLaunchInput shape). We also
 * accept an optional `defaultTax: true | false` \u2014 when true (default) and
 * the caller didn't supply `tax`, we apply the standard 5% fee-rate config
 * routing 100% of tax to the agent's own wallet (so the agent self-funds).
 */
app.post("/prepare", requireAgentAuth(), async (c) => {
	const db = requireDb();
	if (!db) return c.json({ error: "database not configured" }, 500);

	let body: AgentLaunchInput & { defaultTax?: boolean };
	try {
		body = (await c.req.json()) as typeof body;
	} catch {
		return c.json({ error: "invalid JSON body" }, 400);
	}

	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return c.json({ error: "invalid JSON body" }, 400);
	}

	const mismatch = ensureAgentIdMatches(c, body.agentId);
	if (mismatch) return mismatch;

	const authed = (c as unknown as { get(key: "authedAgent"): { agentId: string } }).get("authedAgent");
	const existing = await agentPersonaQueries.getAgentPersonaByAgentId(db, authed.agentId).catch(() => null);
	if (existing?.tokenAddress) {
		return c.json(
			{
				ok: false,
				error: "AGENT_ALREADY_LAUNCHED",
				message: `Agent ${authed.agentId} already launched token ${existing.tokenAddress}`,
			},
			409,
		);
	}

	// Apply 5% default tax unless the agent explicitly opts out (`defaultTax: false`).
	// This is the "agents fund themselves" behavior \u2014 fees route to the
	// agent's own wallet so every trade extends its life.
	const defaultTax = body.defaultTax ?? true;
	if (!body.tax && defaultTax) {
		body = {
			...body,
			tax: {
				feeRate: 5,
				burnRate: 0,
				divideRate: 0,
				liquidityRate: 0,
				recipientRate: 100,
				minSharing: 100_000,
				// recipientAddress intentionally omitted \u2014 orchestrator defaults it
				// to the agent's own wallet.
			},
		};
	}

	let orchestrator: ReturnType<typeof createOrchestrator>;
	try {
		orchestrator = createOrchestrator(buildOrchestratorDeps());
	} catch (err) {
		return c.json(
			{
				error: "orchestrator unavailable",
				detail: err instanceof Error ? err.message : String(err),
			},
			503,
		);
	}

	try {
		const prepared = await orchestrator.prepare(body);
		const rawToken = mintRawToken();
		const claimTokenHash = hashToken(rawToken);
		const ttlMs = Number(process.env.CLAIM_TTL_MS ?? DEFAULT_CLAIM_TTL_MS);
		const claimExpiresAt = new Date(Date.now() + ttlMs);

		// Stash the prelaunch artifacts + claim hash on the persona row.
		await agentPersonaQueries.writePreparedLaunch(db, {
			agentId: prepared.agentId,
			claimTokenHash,
			claimExpiresAt,
			prelaunchParams: body as unknown as Record<string, unknown>,
			prelaunchCreateArg: prepared.createArg,
			prelaunchSignature: prepared.signature,
			taxFeeRate: body.tax?.feeRate ?? null,
			taxRecipientAddress: body.tax?.recipientAddress ?? prepared.treasuryAddress,
			taxConfig: body.tax
				? {
						feeRate: body.tax.feeRate,
						burnRate: body.tax.burnRate,
						divideRate: body.tax.divideRate,
						liquidityRate: body.tax.liquidityRate,
						recipientRate: body.tax.recipientRate,
						minSharing: body.tax.minSharing,
					}
				: null,
		});

		const frontendUrl = process.env.FRONTEND_URL ?? "https://waifu.fun";
		const claimUrl = `${frontendUrl.replace(/\/$/, "")}/claim/${rawToken}`;

		await emitAgentEvent({
			agentId: prepared.agentId,
			eventType: "agent.prepared",
			data: {
				claimExpiresAt: claimExpiresAt.toISOString(),
				walletAddress: prepared.walletAddress,
				treasuryAddress: prepared.treasuryAddress,
				tax: body.tax ?? null,
			},
		});

		if (body.tax) {
			await emitAgentEvent({
				agentId: prepared.agentId,
				eventType: "tax.split.configured",
				data: {
					feeRate: body.tax.feeRate,
					burnRate: body.tax.burnRate,
					divideRate: body.tax.divideRate,
					liquidityRate: body.tax.liquidityRate,
					recipientRate: body.tax.recipientRate,
					minSharing: body.tax.minSharing,
					recipientAddress: body.tax.recipientAddress ?? prepared.treasuryAddress,
				},
			});
		}

		return c.json(
			{
				agentId: prepared.agentId,
				walletAddress: prepared.walletAddress,
				treasuryAddress: prepared.treasuryAddress,
				claimUrl,
				claimToken: rawToken,
				claimExpiresAt: claimExpiresAt.toISOString(),
				fourMeme: prepared.fourMeme,
				identityRegistrationStatus: prepared.identityRegistrationStatus,
				...(prepared.agentIdentity
					? {
							agentIdentity: {
								agentId: prepared.agentIdentity.agentId,
								txHash: prepared.agentIdentity.txHash,
								contractAddress: prepared.agentIdentity.contractAddress,
							},
						}
					: {}),
			},
			200,
		);
	} catch (err) {
		if (err instanceof AgentLaunchError) {
			return c.json(
				{
					error: "agent launch error",
					step: err.step,
					detail: `[${err.step}] ${err.message}`,
				},
				502,
			);
		}
		if (err instanceof FourMemeError) {
			return c.json({ error: "four.meme error", detail: err.message }, 502);
		}
		return c.json(
			{
				error: "unexpected error",
				detail: err instanceof Error ? err.message : String(err),
			},
			500,
		);
	}
});

/**
 * GET /v2/agents/claim/:token
 *
 * Public. Returns the agent card + claim status for a given raw claim token.
 * 404 if not found, 410 if expired.
 */
app.get("/claim/:token", async (c) => {
	const rawToken = c.req.param("token");
	if (!rawToken || rawToken.length < 16) {
		return c.json({ error: "invalid token" }, 404);
	}
	const db = requireDb();
	if (!db) return c.json({ error: "database not configured" }, 500);

	const tokenHash = hashToken(rawToken);
	const claim = await agentPersonaQueries.getClaimByTokenHash(db, tokenHash);
	if (!claim) {
		return c.json({ error: "claim not found" }, 404);
	}
	if (claim.claimExpiresAt && claim.claimExpiresAt.getTime() < Date.now()) {
		return c.json({ error: "claim expired" }, 410);
	}

	const params = (claim.prelaunchParams ?? {}) as Record<string, unknown>;
	const symbol = typeof params.symbol === "string" ? params.symbol : null;

	// Pull the agent's wallet address (from Steward provisioning) so the
	// frontend can render a 'send BNB to this address' box + fund the
	// launch via wagmi.
	//
	// Two fallbacks:
	//   1. agent_wallets.wallet_address (populated when indexer/orchestrator
	//      persists steward ensureAgent result)
	//   2. tax_recipient_address on the persona row (always set during
	//      /prepare when default tax is applied; this equals the agent's
	//      own wallet by default)
	const [walletRow] = await db
		.select({ walletAddress: agentWallets.walletAddress })
		.from(agentWallets)
		.where(eq(agentWallets.internalAgentId, claim.agentId))
		.limit(1);
	const walletAddress = walletRow?.walletAddress ?? claim.taxRecipientAddress ?? null;

	return c.json(
		{
			ok: true,
			data: {
				agent: {
					agentId: claim.agentId,
					name: claim.name,
					bio: claim.bio,
					imageUrl: claim.avatarUrl,
					ticker: symbol,
					walletAddress,
					webUrl: (params.webUrl as string | undefined) ?? null,
					twitterUrl: (params.twitterUrl as string | undefined) ?? null,
					telegramUrl: (params.telegramUrl as string | undefined) ?? null,
				},
				claimStatus: deriveClaimStatus(claim),
				claimedByXHandle: claim.claimedByXHandle,
				expiresAt: claim.claimExpiresAt?.toISOString() ?? null,
				// Ops kill-switch: when LAUNCH_BROADCAST_ENABLED=false on the
				// API, the launch endpoint returns 503. Surface the flag here
				// so the frontend can render a "launches paused" state instead
				// of wiring the user up to a button that will fail.
				launchEnabled: (process.env.LAUNCH_BROADCAST_ENABLED ?? "true").toLowerCase() !== "false",
				tax: claim.taxFeeRate
					? {
							feeRate: claim.taxFeeRate,
							recipientAddress: claim.taxRecipientAddress,
						}
					: null,
			},
		},
		200,
	);
});

/**
 * POST /v2/agents/claim/:token
 *
 * Requires patron auth (X session cookie). Attributes the claim to the
 * patron's X handle + user id. Idempotent \u2014 re-calling with the same
 * patron returns success.
 */
app.post("/claim/:token", requirePatronAuth(), async (c) => {
	const rawToken = c.req.param("token");
	if (!rawToken || rawToken.length < 16) {
		return c.json({ error: "invalid token" }, 404);
	}
	const db = requireDb();
	if (!db) return c.json({ error: "database not configured" }, 500);

	const patronUser = (
		c as unknown as {
			get(key: "patronUser"): {
				xUserId: string;
				xHandle: string;
			} | null;
		}
	).get("patronUser");
	if (!patronUser) return c.json({ error: "not authenticated" }, 401);

	const tokenHash = hashToken(rawToken);
	const claim = await agentPersonaQueries.getClaimByTokenHash(db, tokenHash);
	if (!claim) return c.json({ error: "claim not found" }, 404);
	if (claim.claimExpiresAt && claim.claimExpiresAt.getTime() < Date.now()) {
		return c.json({ error: "claim expired" }, 410);
	}
	if (
		claim.agentLaunchStatus !== "prepared" &&
		!(claim.agentLaunchStatus === "claimed" && claim.claimedByXUserId === patronUser.xUserId)
	) {
		return c.json(
			{
				error: "claim not available",
				status: claim.agentLaunchStatus,
			},
			409,
		);
	}

	const wasAlreadyClaimed = claim.agentLaunchStatus === "claimed";
	await agentPersonaQueries.markClaimed(db, claim.agentId, {
		xUserId: patronUser.xUserId,
		xHandle: patronUser.xHandle,
	});

	if (!wasAlreadyClaimed) {
		await emitAgentEvent({
			agentId: claim.agentId,
			eventType: "agent.claimed",
			data: {
				claimedByXUserId: patronUser.xUserId,
				claimedByXHandle: patronUser.xHandle,
			},
		});
	}

	return c.json(
		{
			ok: true,
			data: {
				agentId: claim.agentId,
				claimedByXHandle: patronUser.xHandle,
			},
		},
		200,
	);
});

/**
 * PATCH /v2/agents/claim/:token
 *
 * Requires patron auth. Lets the claiming patron tweak the agent's name,
 * bio, ticker, and image before launching. We re-run the four.meme
 * create call with the new params and replace the cached
 * (createArg, signature) so the eventual broadcast uses the updated
 * artifact.
 *
 * Fields are all optional. Unspecified fields keep their prepared values.
 */
app.patch("/claim/:token", requirePatronAuth(), async (c) => {
	const rawToken = c.req.param("token");
	if (!rawToken || rawToken.length < 16) {
		return c.json({ error: "invalid token" }, 404);
	}
	const db = requireDb();
	if (!db) return c.json({ error: "database not configured" }, 500);

	const patronUser = (
		c as unknown as {
			get(key: "patronUser"): {
				xUserId: string;
				xHandle: string;
			} | null;
		}
	).get("patronUser");
	if (!patronUser) return c.json({ error: "not authenticated" }, 401);

	let body: {
		name?: string;
		symbol?: string;
		description?: string;
		imageUrl?: string;
		webUrl?: string;
		twitterUrl?: string;
		telegramUrl?: string;
		tax?: {
			feeRate?: 1 | 3 | 5 | 10;
			// 'agent' = route 100% to agent wallet (self-fund, default)
			// 'patron' = route 100% to the claiming patron's wallet
			// 'custom' with recipientAddress = arbitrary address (advanced)
			recipient?: "agent" | "patron" | "custom";
			recipientAddress?: string;
		};
		taxSplit?: {
			agentBps?: number;
			patronBps?: number;
		};
	};
	try {
		body = (await c.req.json()) as typeof body;
	} catch {
		return c.json({ error: "invalid JSON body" }, 400);
	}

	const tokenHash = hashToken(rawToken);
	const claim = await agentPersonaQueries.getClaimByTokenHash(db, tokenHash);
	if (!claim) return c.json({ error: "claim not found" }, 404);
	if (claim.claimExpiresAt && claim.claimExpiresAt.getTime() < Date.now()) {
		return c.json({ error: "claim expired" }, 410);
	}
	if (claim.agentLaunchStatus !== "claimed") {
		return c.json({ error: "claim must be completed before editing", status: claim.agentLaunchStatus }, 409);
	}
	if (claim.claimedByXUserId !== patronUser.xUserId) {
		return c.json({ error: "only the claiming patron can edit" }, 403);
	}

	// Merge new fields over the stored prelaunch params and re-run prepare.
	const cachedParams = (claim.prelaunchParams ?? {}) as Record<string, unknown>;
	const cachedTaxSplit =
		cachedParams.taxSplit && typeof cachedParams.taxSplit === "object"
			? (cachedParams.taxSplit as {
					agentBps?: number;
					patronBps?: number;
					patronAddress?: string;
					splitterAddress?: string;
				})
			: undefined;
	const parsedTaxSplit = parseTaxSplit(body.taxSplit ?? cachedTaxSplit ?? undefined);
	if (!isTaxSplitPatch(parsedTaxSplit)) {
		return c.json({ error: parsedTaxSplit.error }, 400);
	}
	const resolvedImageUrl =
		body.imageUrl && body.imageUrl.trim().length > 0
			? body.imageUrl.trim()
			: (cachedParams.imageUrl as string | undefined);

	// Resolve tax config. Keep whatever was cached unless the patron
	// explicitly overrides. Recipient 'agent' = agent's own wallet (default,
	// self-funding). 'patron' = the claiming patron's address (they'd need
	// to supply it via recipientAddress). 'custom' requires recipientAddress.
	let resolvedTax: AgentLaunchInput["tax"] = (cachedParams.tax as AgentLaunchInput["tax"]) ?? undefined;
	let patronTaxAddress = cachedTaxSplit?.patronAddress;
	if (body.tax) {
		const feeRate = body.tax.feeRate ?? resolvedTax?.feeRate ?? 5;
		if (![1, 3, 5, 10].includes(feeRate)) {
			return c.json({ error: "tax.feeRate must be 1, 3, 5, or 10" }, 400);
		}
		let recipientOverride: string | undefined;
		if (body.tax.recipient === "custom" || body.tax.recipient === "patron") {
			if (!body.tax.recipientAddress || !/^0x[a-fA-F0-9]{40}$/.test(body.tax.recipientAddress)) {
				return c.json({ error: "tax.recipientAddress required for this recipient type" }, 400);
			}
			recipientOverride = body.tax.recipientAddress;
			patronTaxAddress = recipientOverride;
		} else if (body.tax.recipient === "agent") {
			patronTaxAddress = undefined;
		}
		// 'agent' = leave recipientAddress undefined; orchestrator defaults it
		// to the agent's own wallet. For patron/custom, recipientAddress is the
		// patron side of the split; the orchestrator swaps in the splitter as the
		// actual single Four.Meme recipient after deploying it.
		resolvedTax = {
			feeRate: feeRate as 1 | 3 | 5 | 10,
			burnRate: 0,
			divideRate: 0,
			liquidityRate: 0,
			recipientRate: 100,
			minSharing: 100_000,
			...(recipientOverride ? { recipientAddress: recipientOverride as `0x${string}` } : {}),
		};
	}

	// Merge optional social/link fields. Empty string explicitly clears.
	const resolvedWebUrl =
		body.webUrl !== undefined ? body.webUrl.trim() || undefined : (cachedParams.webUrl as string | undefined);
	const resolvedTwitterUrl =
		body.twitterUrl !== undefined
			? body.twitterUrl.trim() || undefined
			: (cachedParams.twitterUrl as string | undefined);
	const resolvedTelegramUrl =
		body.telegramUrl !== undefined
			? body.telegramUrl.trim() || undefined
			: (cachedParams.telegramUrl as string | undefined);

	const keepCachedSplitter =
		cachedTaxSplit?.splitterAddress &&
		cachedTaxSplit.agentBps === parsedTaxSplit.agentBps &&
		cachedTaxSplit.patronBps === parsedTaxSplit.patronBps &&
		cachedTaxSplit.patronAddress === patronTaxAddress;
	const resolvedTaxSplit = {
		agentBps: parsedTaxSplit.agentBps,
		patronBps: parsedTaxSplit.patronBps,
		...(patronTaxAddress ? { patronAddress: patronTaxAddress as `0x${string}` } : {}),
		...(keepCachedSplitter ? { splitterAddress: cachedTaxSplit.splitterAddress as `0x${string}` } : {}),
	};

	const nextInput: AgentLaunchInput = {
		...(cachedParams as unknown as AgentLaunchInput),
		agentId: claim.agentId,
		name: body.name && body.name.trim().length > 0 ? body.name.trim() : (cachedParams.name as string),
		symbol:
			body.symbol && body.symbol.trim().length > 0
				? body.symbol.trim().toUpperCase().slice(0, 10)
				: (cachedParams.symbol as string),
		description:
			body.description && body.description.trim().length > 0
				? body.description.trim().slice(0, 500)
				: (cachedParams.description as string),
		...(resolvedImageUrl ? { imageUrl: resolvedImageUrl } : {}),
		...(resolvedWebUrl ? { webUrl: resolvedWebUrl } : {}),
		...(resolvedTwitterUrl ? { twitterUrl: resolvedTwitterUrl } : {}),
		...(resolvedTelegramUrl ? { telegramUrl: resolvedTelegramUrl } : {}),
		...(resolvedTax ? { tax: resolvedTax } : {}),
		taxSplit: resolvedTaxSplit,
	};

	let orchestrator: ReturnType<typeof createOrchestrator>;
	try {
		orchestrator = createOrchestrator(buildOrchestratorDeps());
	} catch (err) {
		return c.json(
			{
				error: "orchestrator unavailable",
				detail: err instanceof Error ? err.message : String(err),
			},
			503,
		);
	}

	try {
		const prepared = await orchestrator.prepare(nextInput);
		const preparedInput: AgentLaunchInput =
			prepared.taxSplit?.splitterAddress && nextInput.tax
				? {
						...nextInput,
						tax: { ...nextInput.tax, recipientAddress: prepared.treasuryAddress },
						taxSplit: prepared.taxSplit,
					}
				: nextInput;
		// Refresh the cached artifacts. Keep the existing claim token hash +
		// expiry so the URL stays valid.
		await db
			.update(agentPersonas)
			.set({
				name: nextInput.name,
				bio: nextInput.description ?? null,
				avatarUrl: nextInput.imageUrl ?? null,
				prelaunchParams: preparedInput as unknown as Record<string, unknown>,
				prelaunchCreateArg: prepared.createArg,
				prelaunchSignature: prepared.signature,
				taxFeeRate: nextInput.tax?.feeRate ?? null,
				taxRecipientAddress: prepared.treasuryAddress ?? null,
				taxConfig: nextInput.tax
					? {
							feeRate: nextInput.tax.feeRate,
							burnRate: nextInput.tax.burnRate,
							divideRate: nextInput.tax.divideRate,
							liquidityRate: nextInput.tax.liquidityRate,
							recipientRate: nextInput.tax.recipientRate,
							minSharing: nextInput.tax.minSharing,
						}
					: null,
				updatedAt: new Date(),
			})
			.where(eq(agentPersonas.agentId, claim.agentId));

		await emitAgentEvent({
			agentId: claim.agentId,
			eventType: "tax.split.configured",
			data: {
				agentBps: parsedTaxSplit.agentBps,
				patronBps: parsedTaxSplit.patronBps,
				splitterAddress: prepared.taxSplit?.splitterAddress ?? null,
				...(body.tax && resolvedTax
					? {
							feeRate: resolvedTax.feeRate,
							burnRate: resolvedTax.burnRate,
							divideRate: resolvedTax.divideRate,
							liquidityRate: resolvedTax.liquidityRate,
							recipientRate: resolvedTax.recipientRate,
							minSharing: resolvedTax.minSharing,
							recipientAddress: resolvedTax.recipientAddress ?? prepared.treasuryAddress ?? null,
						}
					: {}),
			},
		});

		return c.json(
			{
				ok: true,
				data: {
					agentId: claim.agentId,
					name: nextInput.name,
					symbol: nextInput.symbol,
					imageUrl: nextInput.imageUrl ?? null,
					taxSplit: {
						agentBps: parsedTaxSplit.agentBps,
						patronBps: parsedTaxSplit.patronBps,
						splitterAddress: prepared.taxSplit?.splitterAddress ?? null,
					},
				},
			},
			200,
		);
	} catch (err) {
		if (err instanceof AgentLaunchError) {
			return c.json({ error: "agent launch error", step: err.step, detail: `[${err.step}] ${err.message}` }, 502);
		}
		if (err instanceof FourMemeError) {
			return c.json({ error: "four.meme error", detail: err.message }, 502);
		}
		return c.json({ error: "unexpected error", detail: err instanceof Error ? err.message : String(err) }, 500);
	}
});

/**
 * POST /v2/agents/claim/:token/launch
 *
 * Requires patron auth. Broadcasts the on-chain createToken using the cached
 * (createArg, signature). Returns the live token address.
 */
app.post("/claim/:token/launch", requirePatronAuth(), async (c) => {
	// Kill-switch so ops can pause broadcasts without redeploying code.
	// Set LAUNCH_BROADCAST_ENABLED=false on Railway to park the flow while
	// still letting agents prepare + patrons claim + edit. Re-enable when
	// you're ready to ship a live launch.
	const launchBroadcastEnabled = (process.env.LAUNCH_BROADCAST_ENABLED ?? "true").toLowerCase() !== "false";
	if (!launchBroadcastEnabled) {
		return c.json(
			{
				error: "launches paused",
				detail:
					"Live token broadcasts are temporarily paused. Claim and edit still work. Check back soon or ping the contributors on github.com/waifufun.",
			},
			503,
		);
	}

	const rawToken = c.req.param("token");
	if (!rawToken || rawToken.length < 16) {
		return c.json({ error: "invalid token" }, 404);
	}
	const db = requireDb();
	if (!db) return c.json({ error: "database not configured" }, 500);

	const patronUser = (
		c as unknown as {
			get(key: "patronUser"): {
				xUserId: string;
				xHandle: string;
			} | null;
		}
	).get("patronUser");
	if (!patronUser) return c.json({ error: "not authenticated" }, 401);

	const tokenHash = hashToken(rawToken);
	const claim = await agentPersonaQueries.getClaimByTokenHash(db, tokenHash);
	if (!claim) return c.json({ error: "claim not found" }, 404);
	if (claim.claimExpiresAt && claim.claimExpiresAt.getTime() < Date.now()) {
		return c.json({ error: "claim expired" }, 410);
	}
	if (claim.agentLaunchStatus !== "claimed") {
		return c.json(
			{
				error: "claim must be completed before launch",
				status: claim.agentLaunchStatus,
			},
			409,
		);
	}
	if (claim.claimedByXUserId !== patronUser.xUserId) {
		return c.json({ error: "only the claiming patron can trigger launch" }, 403);
	}
	if (!claim.prelaunchCreateArg || !claim.prelaunchSignature) {
		return c.json({ error: "prelaunch artifacts missing" }, 500);
	}

	// Look up wallet for the agent to pass to orchestrator.
	const persona = await agentPersonaQueries.getAgentPersonaByAgentId(db, claim.agentId);
	if (!persona) return c.json({ error: "agent not found" }, 404);

	let orchestrator: ReturnType<typeof createOrchestrator>;
	try {
		orchestrator = createOrchestrator(buildOrchestratorDeps());
	} catch (err) {
		return c.json(
			{
				error: "orchestrator unavailable",
				detail: err instanceof Error ? err.message : String(err),
			},
			503,
		);
	}

	try {
		// Resolve the wallet address from Steward using the agentId.
		// We don't store it on agent_personas, but the orchestrator's broadcast
		// step only needs agentId + hex artifacts, so pass a placeholder that
		// satisfies the type. Steward does the real lookup by agentId.
		const placeholderWallet = "0x0000000000000000000000000000000000000000" as const;

		const broadcastResult = await orchestrator.broadcastPrepared({
			agentId: claim.agentId,
			walletAddress: placeholderWallet,
			createArg: claim.prelaunchCreateArg as `0x${string}`,
			signature: claim.prelaunchSignature as `0x${string}`,
		});

		await agentPersonaQueries.markLaunched(db, claim.agentId, {
			tokenAddress: broadcastResult.tokenAddress,
			launchTxHash: broadcastResult.txHash,
		});

		const [walletRow] = await db
			.select({ walletAddress: agentWallets.walletAddress })
			.from(agentWallets)
			.where(eq(agentWallets.internalAgentId, claim.agentId))
			.limit(1);
		const agentWalletAddress = walletRow?.walletAddress ?? null;
		const adminWallets = buildClaimLaunchAdminWallets(persona);

		try {
			await emitAgentEvent({
				agentId: claim.agentId,
				eventType: "agent.launched",
				data: {
					tokenAddress: broadcastResult.tokenAddress,
					tokenContractAddress: broadcastResult.tokenAddress,
					tokenName: stringField(recordFromUnknown(claim.prelaunchParams), "name") ?? claim.name,
					tokenTicker:
						stringField(recordFromUnknown(claim.prelaunchParams), "symbol") ?? claim.agentId.slice(0, 10).toUpperCase(),
					walletAddress: agentWalletAddress,
					primaryWalletAddress: agentWalletAddress,
					adminWallets,
					guestMinTokens: 1_000,
					userMinTokens: 100_000,
					claimedByXHandle: patronUser.xHandle,
					txHash: broadcastResult.txHash,
				},
			});
		} catch {
			/* launch already persisted; don't fail the response on event emit */
		}

		let runtimeProvisioning: unknown = null;
		let runtimeProvisioningError: string | null = null;
		try {
			runtimeProvisioning = await provisionClaimedAgent(claim.agentId, {
				tokenAddress: broadcastResult.tokenAddress,
				tokenContractAddress: broadcastResult.tokenAddress,
				tokenName: stringField(recordFromUnknown(claim.prelaunchParams), "name") ?? claim.name,
				tokenTicker:
					stringField(recordFromUnknown(claim.prelaunchParams), "symbol") ?? claim.agentId.slice(0, 10).toUpperCase(),
				chain: "bsc",
				chainId: Number(process.env.FOURMEME_CHAIN_ID ?? process.env.BSC_CHAIN_ID ?? 56),
				launchType: "native",
				walletAddress: agentWalletAddress,
				primaryWalletAddress: agentWalletAddress,
				adminWallets,
				guestMinTokens: 1_000,
				userMinTokens: 100_000,
				claimedByXHandle: patronUser.xHandle,
			});
		} catch (err) {
			runtimeProvisioningError = err instanceof Error ? err.message : String(err);
		}

		return c.json(
			{
				ok: true,
				data: {
					agentId: claim.agentId,
					tokenAddress: broadcastResult.tokenAddress,
					txHash: broadcastResult.txHash,
					claimedByXHandle: patronUser.xHandle,
					runtimeProvisioning,
					runtimeProvisioningError,
				},
			},
			200,
		);
	} catch (err) {
		if (err instanceof AgentLaunchError) {
			return c.json(
				{
					error: "agent launch error",
					step: err.step,
					detail: `[${err.step}] ${err.message}`,
				},
				502,
			);
		}
		return c.json(
			{
				error: "unexpected error",
				detail: err instanceof Error ? err.message : String(err),
			},
			500,
		);
	}
});

// Attach the public claim GET to allow unauthenticated reads; the POST
// variants already declare `requirePatronAuth()`. `attachPatronUser()`
// on the whole app lets us surface `claimedByXHandle` consistently.
app.use("/claim/*", attachPatronUser());

function deriveClaimStatus(claim: {
	agentLaunchStatus: string | null;
	claimExpiresAt: Date | null;
	tokenAddress: string | null;
}): "needs-x" | "needs-fund" | "launched" | "expired" {
	if (claim.tokenAddress && claim.agentLaunchStatus === "launched") return "launched";
	if (claim.claimExpiresAt && claim.claimExpiresAt.getTime() < Date.now()) return "expired";
	if (claim.agentLaunchStatus === "claimed") return "needs-fund";
	return "needs-x";
}

export default app;
