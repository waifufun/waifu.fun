/**
 * REST routes for the W42 LaunchFactory-driven launch flow.
 *
 * Mounted under /v2/launches. The v2/index.ts file registers this router
 * BEFORE the legacy launchRoutes/launchAuthorizeRoutes so that the new
 * resource shape wins on collisions (POST / and GET /:id specifically).
 *
 * The route handlers stay thin: input validation + DB lookup + on-chain
 * read/write delegated to {@link LaunchService} and {@link launchRepo}.
 */

import { Hono } from "hono";
import { z } from "zod";

import { getDatabase } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";

import type { AppBindings } from "../../lib/bindings.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { respondAccepted, respondOk } from "../../lib/http.js";
import { parseJsonBody } from "../../lib/validation.js";
import {
	type CreateLaunchInput,
	LaunchService,
	type LaunchServiceConfig,
	type LaunchTierString,
	launchRepo,
} from "../../services/launch-v2/index.js";

const addressRegex = /^0x[a-fA-F0-9]{40}$/;
const addressSchema = z
	.string()
	.trim()
	.regex(addressRegex, "Expected a 20-byte EVM address")
	.transform((v) => v.toLowerCase() as `0x${string}`);

const tierSchema = z.enum(["80", "90", "95", "98"]);

const createLaunchBodySchema = z.object({
	name: z.string().trim().min(1).max(64),
	symbol: z
		.string()
		.trim()
		.min(1)
		.max(16)
		.transform((v) => v.toUpperCase()),
	metadataURI: z.string().trim().min(1).max(2048),
	creator: addressSchema,
	tier: tierSchema,
	closeTimestamp: z.coerce.number().int().positive().optional(),
});

const previewBodySchema = z.object({
	bnbAmount: z.union([z.string(), z.number()]).transform((v, ctx) => {
		const str = typeof v === "string" ? v.trim() : v.toString();
		try {
			const n = BigInt(str);
			if (n < 0n) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, message: "bnbAmount must be non-negative" });
				return z.NEVER;
			}
			return n;
		} catch {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: "bnbAmount must be a wei integer string" });
			return z.NEVER;
		}
	}),
});

const listQuerySchema = z.object({
	creator: addressSchema.optional(),
	state: z.enum(["open", "closed", "launched", "failed"]).optional(),
	tier: z.coerce
		.number()
		.int()
		.refine((n) => [80, 90, 95, 98].includes(n))
		.optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).default(0),
});

export interface AgentLaunchRoutesOptions {
	db?: Database;
	launchService?: LaunchService;
	getDb?: () => Database | null;
	getService?: () => LaunchService | null;
}

function defaultDb(): Database | null {
	const url = process.env.DATABASE_URL;
	if (!url) return null;
	return getDatabase(url).db;
}

function defaultService(): LaunchService | null {
	const factoryAddress = process.env.LAUNCH_FACTORY_ADDRESS as `0x${string}` | undefined;
	const rpcUrl = process.env.ALCHEMY_BSC_KEY
		? `https://bnb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_BSC_KEY}`
		: (process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org");
	const chainId = Number(process.env.BSC_CHAIN_ID ?? 56);

	if (!factoryAddress) return null;

	const config: LaunchServiceConfig = {
		chainId,
		rpcUrl,
		launchFactoryAddress: factoryAddress,
		signerPrivateKey: process.env.LAUNCH_FACTORY_SIGNER_PK as `0x${string}` | undefined,
		presaleUrlBase: process.env.LAUNCH_PRESALE_URL_BASE,
	};
	return new LaunchService(config);
}

/**
 * Serialize agent_launches row to the public API shape (the `state` document
 * in the spec). bigints become strings; addresses are returned as stored
 * (lowercase). Optional on-chain fields are filled in by the route handler
 * when fresh data is requested.
 */
export function serializeAgentLaunch(
	row: typeof launchRepo.listLaunches extends never ? never : Awaited<ReturnType<typeof launchRepo.getLaunchById>>,
) {
	if (!row) return null;
	return {
		id: row.id,
		token: row.tokenAddress,
		vault: row.vaultAddress,
		router: row.routerAddress,
		treasuryLp: row.treasuryLpAddress,
		creator: row.creator,
		tier: row.tier,
		state: row.state,
		totalDeposited: row.totalDeposited,
		bonusPool: row.bonusPool,
		depositorCount: row.depositorCount,
		capacity: row.presaleCap,
		v2BuyBnb: row.v2BuyBnb,
		vestingEnabled: row.vestingEnabled === 1,
		closeTimestamp: row.closeTimestamp ? Number(row.closeTimestamp) : null,
		launchTimestamp: row.launchTimestamp ? Number(row.launchTimestamp) : null,
		v2Pair: row.v2Pair,
		openMcBnb: row.openMcBnb,
		metadataUri: row.metadataUri,
		metadata: row.metadata ?? {},
		createTxHash: row.createTxHash,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

export function createAgentLaunchRoutes(options: AgentLaunchRoutesOptions = {}) {
	const app = new Hono<AppBindings>();

	const resolveDb = (): Database => {
		const db = options.db ?? options.getDb?.() ?? defaultDb();
		if (!db) throw badRequest("DB_UNAVAILABLE", "Database is not configured");
		return db;
	};

	const resolveService = (): LaunchService => {
		const svc = options.launchService ?? options.getService?.() ?? defaultService();
		if (!svc) {
			throw badRequest("LAUNCH_SERVICE_UNAVAILABLE", "Launch service is not configured (set LAUNCH_FACTORY_ADDRESS).");
		}
		return svc;
	};

	// POST /v2/launches — submit createLaunch on-chain and persist a row.
	app.post("/", async (c) => {
		const body = await parseJsonBody(c, createLaunchBodySchema);
		const db = resolveDb();
		const service = resolveService();

		const closeTs = body.closeTimestamp ?? Math.floor(Date.now() / 1000) + 24 * 60 * 60;
		const tier = body.tier as LaunchTierString;

		const input: CreateLaunchInput = {
			name: body.name,
			symbol: body.symbol,
			metadataURI: body.metadataURI,
			creator: body.creator,
			tier,
			closeTimestamp: closeTs,
		};

		const onchain = await service.createLaunchOnchain(input);

		// Pre-compute tier config so we have a snapshot independent of the contract.
		const presaleCapByTier: Record<LaunchTierString, string> = {
			"80": "16000000000000000000",
			"90": "32000000000000000000",
			"95": "64000000000000000000",
			"98": "160000000000000000000",
		};
		const v2BuyByTier: Record<LaunchTierString, string> = {
			"80": "0",
			"90": "16000000000000000000",
			"95": "48000000000000000000",
			"98": "144000000000000000000",
		};
		const vestingByTier: Record<LaunchTierString, boolean> = {
			"80": false,
			"90": true,
			"95": true,
			"98": true,
		};

		const row = await launchRepo.insertLaunch(db, {
			tokenAddress: onchain.token,
			vaultAddress: onchain.vault,
			routerAddress: onchain.router,
			creator: input.creator,
			tier: Number(tier),
			presaleCap: presaleCapByTier[tier],
			v2BuyBnb: v2BuyByTier[tier],
			vestingEnabled: vestingByTier[tier],
			closeTimestamp: BigInt(closeTs),
			metadataUri: input.metadataURI,
			createTxHash: onchain.txHash,
			createBlockNumber: onchain.blockNumber,
		});

		return respondAccepted(c, {
			id: row.id,
			token: row.tokenAddress,
			vault: row.vaultAddress,
			router: row.routerAddress,
			presaleUrl: onchain.presaleUrl,
			txHash: onchain.txHash,
		});
	});

	// GET /v2/launches — paginated list with filters.
	app.get("/", async (c) => {
		const url = new URL(c.req.url);
		const parsed = listQuerySchema.safeParse(Object.fromEntries(url.searchParams));
		if (!parsed.success) {
			throw badRequest("INVALID_QUERY", "Invalid query parameters", parsed.error.flatten());
		}
		const db = resolveDb();
		const result = await launchRepo.listLaunches(db, {
			creator: parsed.data.creator,
			state: parsed.data.state,
			tier: parsed.data.tier,
			limit: parsed.data.limit,
			offset: parsed.data.offset,
		});

		return respondOk(c, {
			launches: result.launches.map((row) => serializeAgentLaunch(row)),
			total: result.total,
			limit: parsed.data.limit,
			offset: parsed.data.offset,
		});
	});

	// GET /v2/launches/:id — single launch with full state.
	//
	// Constrained to UUID-shaped ids so the legacy GET /:id (which serves the
	// patron-authorize `launches` table by varied id formats) still resolves
	// for non-UUID requests. agent_launches IDs are always UUIDs (see schema).
	app.get("/:id{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}", async (c) => {
		const id = c.req.param("id");
		if (!id || id.length > 128) throw badRequest("INVALID_ID", "Invalid launch id");

		const db = resolveDb();
		const row = await launchRepo.getLaunchById(db, id);
		if (!row) {
			throw notFound("LAUNCH_NOT_FOUND", "Launch not found");
		}

		// Best-effort live state refresh from chain. Failures are non-fatal —
		// we still return the persisted snapshot.
		let live: Awaited<ReturnType<LaunchService["readVaultState"]>> | null = null;
		try {
			const service = options.launchService ?? options.getService?.() ?? defaultService();
			if (service) {
				live = await service.readVaultState(row.vaultAddress as `0x${string}`);
			}
		} catch {
			live = null;
		}

		const base = serializeAgentLaunch(row);
		if (!base) return c.notFound();

		const merged = live
			? {
					...base,
					state: live.state,
					totalDeposited: live.totalDeposited.toString(),
					bonusPool: live.bonusPool.toString(),
					depositorCount: live.depositorCount,
					launchTimestamp: live.launchTimestamp !== null ? Number(live.launchTimestamp) : base.launchTimestamp,
				}
			: base;

		return respondOk(c, merged);
	});

	// GET /v2/launches/:id/depositors — full depositor list (with claimables).
	app.get("/:id{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/depositors", async (c) => {
		const id = c.req.param("id");
		const db = resolveDb();
		const row = await launchRepo.getLaunchById(db, id);
		if (!row) throw notFound("LAUNCH_NOT_FOUND", "Launch not found");

		const aggregates = await launchRepo.listDepositors(db, id);

		// Optionally enrich with on-chain claimable state. If the service is
		// not configured, we return aggregates with claimable=null.
		const service = options.launchService ?? options.getService?.() ?? defaultService();
		const enriched = await Promise.all(
			aggregates.map(async (agg) => {
				let claimable: string | null = null;
				if (service) {
					try {
						const pos = await service.readDepositorPosition(
							row.vaultAddress as `0x${string}`,
							agg.address as `0x${string}`,
						);
						claimable = pos.claimable.toString();
					} catch {
						claimable = null;
					}
				}
				return {
					address: agg.address,
					deposited: agg.netDeposit,
					grossDeposited: agg.deposited,
					withdrawn: agg.withdrawn,
					claimed: agg.claimed,
					claimable,
				};
			}),
		);

		return respondOk(c, { depositors: enriched, count: enriched.length });
	});

	// GET /v2/launches/:id/depositors/:address — single user position.
	app.get(
		"/:id{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/depositors/:address",
		async (c) => {
			const id = c.req.param("id");
			const userAddress = c.req.param("address");
			if (!userAddress || !addressRegex.test(userAddress)) {
				throw badRequest("INVALID_ADDRESS", "Invalid EVM address");
			}
			const normalized = userAddress.toLowerCase() as `0x${string}`;

			const db = resolveDb();
			const row = await launchRepo.getLaunchById(db, id);
			if (!row) throw notFound("LAUNCH_NOT_FOUND", "Launch not found");

			const aggregate = await launchRepo.getDepositorAggregate(db, id, normalized);

			const service = options.launchService ?? options.getService?.() ?? defaultService();
			let onchain: Awaited<ReturnType<LaunchService["readDepositorPosition"]>> | null = null;
			if (service) {
				try {
					onchain = await service.readDepositorPosition(row.vaultAddress as `0x${string}`, normalized);
				} catch {
					onchain = null;
				}
			}

			return respondOk(c, {
				address: normalized,
				deposited: onchain ? onchain.deposited.toString() : (aggregate?.netDeposit ?? "0"),
				totalAllocation: onchain ? onchain.totalAllocation.toString() : null,
				claimed: onchain ? onchain.claimed.toString() : (aggregate?.claimed ?? "0"),
				claimable: onchain ? onchain.claimable.toString() : null,
				vestingProgress: onchain?.vestingProgress ?? 0,
			});
		},
	);

	// POST /v2/launches/:id/preview — preview token allocation for a deposit.
	app.post("/:id{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/preview", async (c) => {
		const id = c.req.param("id");
		const body = await parseJsonBody(c, previewBodySchema);

		const db = resolveDb();
		const row = await launchRepo.getLaunchById(db, id);
		if (!row) throw notFound("LAUNCH_NOT_FOUND", "Launch not found");

		const service = resolveService();
		const result = await service.previewAllocation(row.vaultAddress as `0x${string}`, {
			bnbAmount: body.bnbAmount,
		});

		return respondOk(c, {
			tokens: result.tokens.toString(),
			share: result.share,
			projectedValue: result.projectedValueBnb.toString(),
		});
	});

	return app;
}

// Default export wired to env-driven dependencies (used by v2/index.ts).
export default createAgentLaunchRoutes();
