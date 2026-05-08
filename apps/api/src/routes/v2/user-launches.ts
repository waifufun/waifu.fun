/**
 * REST routes for user-centric launch queries (W51 patron dashboard).
 *
 * Mounted under /v2/users. Returns the full set of launches an address
 * has touched (deposited/withdrawn/claimed), with on-chain claimable
 * amounts filled in via the LaunchService when available.
 *
 * The route stays thin: SQL aggregation lives in launch-repo, on-chain
 * reads in LaunchService. We just stitch the two together.
 */

import { Hono } from "hono";

import { getDatabase } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";

import type { AppBindings } from "../../lib/bindings.js";
import { badRequest } from "../../lib/errors.js";
import { respondOk } from "../../lib/http.js";
import { LaunchService, type LaunchServiceConfig, launchRepo } from "../../services/launch-v2/index.js";
import { serializeAgentLaunch } from "./agent-launches.js";

const addressRegex = /^0x[a-fA-F0-9]{40}$/;

export interface UserLaunchRoutesOptions {
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

export function createUserLaunchRoutes(options: UserLaunchRoutesOptions = {}) {
	const app = new Hono<AppBindings>();

	const resolveDb = (): Database => {
		const db = options.db ?? options.getDb?.() ?? defaultDb();
		if (!db) throw badRequest("DB_UNAVAILABLE", "Database is not configured");
		return db;
	};

	// GET /v2/users/:address/launches — every launch this address has backed.
	//
	// Response shape:
	//   {
	//     launches: Array<{
	//       launch: <serializeAgentLaunch shape>,
	//       position: {
	//         deposited: string,        // sum of indexed deposits (gross)
	//         withdrawn: string,        // sum of indexed withdrawals (gross)
	//         netDeposit: string,       // deposited - withdrawn (>= 0)
	//         claimed: string,          // sum of indexed claims (token wei)
	//         claimable: string | null, // on-chain claimableOf(user); null if RPC unavailable
	//         totalAllocation: string | null, // on-chain allocation snapshot
	//         vestingProgress: number,  // 0..1 fraction
	//       }
	//     }>,
	//     count: number
	//   }
	app.get("/:address/launches", async (c) => {
		const userAddress = c.req.param("address");
		if (!userAddress || !addressRegex.test(userAddress)) {
			throw badRequest("INVALID_ADDRESS", "Invalid EVM address");
		}
		const normalized = userAddress.toLowerCase() as `0x${string}`;

		const db = resolveDb();
		const aggregates = await launchRepo.listUserLaunches(db, normalized);

		const service = options.launchService ?? options.getService?.() ?? defaultService();

		const enriched = await Promise.all(
			aggregates.map(async (entry) => {
				let claimable: string | null = null;
				let totalAllocation: string | null = null;
				let vestingProgress = 0;

				if (service) {
					try {
						const pos = await service.readDepositorPosition(entry.launch.vaultAddress as `0x${string}`, normalized);
						claimable = pos.claimable.toString();
						totalAllocation = pos.totalAllocation.toString();
						vestingProgress = pos.vestingProgress;
					} catch {
						// RPC blip — degrade gracefully, frontend can fallback to
						// on-chain reads via wagmi.
					}
				}

				return {
					launch: serializeAgentLaunch(entry.launch as never),
					position: {
						deposited: entry.netDeposit,
						grossDeposited: entry.deposited,
						withdrawn: entry.withdrawn,
						claimed: entry.claimed,
						claimable,
						totalAllocation,
						vestingProgress,
					},
				};
			}),
		);

		return respondOk(c, { launches: enriched, count: enriched.length });
	});

	return app;
}

export default createUserLaunchRoutes();
