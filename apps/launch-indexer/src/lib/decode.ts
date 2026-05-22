/**
 * Pure event decoder. Splits the "fetch RPC logs" concern from the "decode a
 * raw log into a typed envelope" concern so that unit tests can exercise the
 * decoder against hand-crafted topic/data pairs without any network.
 *
 * Mirrors wave H on-chain event signatures 1:1; see `./abis.ts`.
 */

import { decodeEventLog } from "viem";
import type { Hex } from "viem";

import { allLaunchEventAbis } from "./abis.js";
import type { LaunchEvent, LaunchEventName } from "./events.js";

export interface RawLog {
	address: `0x${string}`;
	data: Hex;
	topics: [Hex, ...Hex[]] | [];
	blockNumber: bigint;
	transactionHash: `0x${string}`;
	logIndex: number;
}

const KNOWN_EVENTS: ReadonlySet<LaunchEventName> = new Set<LaunchEventName>([
	"LaunchCreated",
	"RouterSet",
	"Deposited",
	"Withdrawn",
	"Closed",
	"LaunchExecuted",
	"Distributed",
	"RefundEnabled",
	"Refunded",
	"Claimed",
	"BundleExecuted",
	"BundleFailed",
	"TokenCreated",
	"LaunchedToDEX",
]);

function bn(value: unknown): string {
	return (value as bigint).toString();
}

export function decodeLaunchLog(input: { log: RawLog; chainId: number; blockTimestamp: Date }): LaunchEvent | null {
	const { log, chainId, blockTimestamp } = input;
	if (log.blockNumber == null || log.transactionHash == null) {
		return null;
	}

	let decoded: { eventName: string; args: Record<string, unknown> };
	try {
		decoded = decodeEventLog({
			abi: allLaunchEventAbis,
			data: log.data,
			topics: log.topics,
		}) as { eventName: string; args: Record<string, unknown> };
	} catch {
		return null;
	}

	if (!KNOWN_EVENTS.has(decoded.eventName as LaunchEventName)) {
		return null;
	}

	const base = {
		chainId,
		contractAddress: log.address,
		blockNumber: log.blockNumber,
		txHash: log.transactionHash,
		logIndex: log.logIndex,
		blockTimestamp,
	};

	const args = decoded.args;

	switch (decoded.eventName as LaunchEventName) {
		case "LaunchCreated":
			return {
				...base,
				eventName: "LaunchCreated",
				data: {
					launchId: args.launchId as `0x${string}`,
					creator: args.creator as `0x${string}`,
					predictedToken: args.predictedToken as `0x${string}`,
					vault: args.vault as `0x${string}`,
					router: args.router as `0x${string}`,
					treasuryLp: args.treasuryLp as `0x${string}`,
					taxSplitter: args.taxSplitter as `0x${string}`,
					agentSafe: args.agentSafe as `0x${string}`,
					tier: Number(args.tier as bigint | number),
					presaleCap: bn(args.presaleCap),
					v2BuyBnb: bn(args.v2BuyBnb),
					closeTimestamp: bn(args.closeTimestamp),
				},
			};

		case "RouterSet":
			return {
				...base,
				eventName: "RouterSet",
				data: {
					router: args.router as `0x${string}`,
				},
			};

		case "Deposited":
			return {
				...base,
				eventName: "Deposited",
				data: {
					user: args.user as `0x${string}`,
					amount: bn(args.amount),
					newTotal: bn(args.newTotal),
				},
			};

		case "Withdrawn":
			return {
				...base,
				eventName: "Withdrawn",
				data: {
					user: args.user as `0x${string}`,
					amount: bn(args.amount),
					penalty: bn(args.penalty),
					refund: bn(args.refund),
				},
			};

		case "Closed":
			return {
				...base,
				eventName: "Closed",
				data: {
					by: args.by as `0x${string}`,
					totalDeposited: bn(args.totalDeposited),
					bonusPool: bn(args.bonusPool),
				},
			};

		case "LaunchExecuted":
			return {
				...base,
				eventName: "LaunchExecuted",
				data: {
					token: args.token as `0x${string}`,
					totalBnb: bn(args.totalBnb),
					timestamp: bn(args.timestamp),
				},
			};

		case "Distributed":
			return {
				...base,
				eventName: "Distributed",
				data: {
					token: args.token as `0x${string}`,
					presalerShare: bn(args.presalerShare),
				},
			};

		case "RefundEnabled":
			return {
				...base,
				eventName: "RefundEnabled",
				data: {
					by: args.by as `0x${string}`,
					reason: String(args.reason ?? ""),
				},
			};

		case "Refunded":
			return {
				...base,
				eventName: "Refunded",
				data: {
					user: args.user as `0x${string}`,
					principal: bn(args.principal),
					bonus: bn(args.bonus),
					refundAmount: bn(args.refundAmount),
				},
			};

		case "Claimed":
			return {
				...base,
				eventName: "Claimed",
				data: {
					user: args.user as `0x${string}`,
					amount: bn(args.amount),
					totalClaimed: bn(args.totalClaimed),
				},
			};

		case "BundleExecuted":
			return {
				...base,
				eventName: "BundleExecuted",
				data: {
					token: args.token as `0x${string}`,
					pool: args.pool as `0x${string}`,
					quoteAmt: bn(args.quoteAmt),
					v2BuyBnb: bn(args.v2BuyBnb),
					tokensReceived: bn(args.tokensReceived),
					tokensBurned: bn(args.tokensBurned),
					tokensToTreasury: bn(args.tokensToTreasury),
					tokensToVault: bn(args.tokensToVault),
					tipPaid: bn(args.tipPaid),
					openMcBnb: bn(args.openMcBnb),
				},
			};

		case "BundleFailed":
			return {
				...base,
				eventName: "BundleFailed",
				data: {
					reason: String(args.reason ?? ""),
				},
			};

		case "TokenCreated":
			return {
				...base,
				eventName: "TokenCreated",
				data: {
					ts: bn(args.ts),
					creator: args.creator as `0x${string}`,
					nonce: bn(args.nonce),
					token: args.token as `0x${string}`,
					name: String(args.name ?? ""),
					symbol: String(args.symbol ?? ""),
					meta: String(args.meta ?? ""),
				},
			};

		case "LaunchedToDEX":
			return {
				...base,
				eventName: "LaunchedToDEX",
				data: {
					token: args.token as `0x${string}`,
					pair: args.pair as `0x${string}`,
					quoteAmt: bn(args.quoteAmt),
				},
			};

		default:
			return null;
	}
}
