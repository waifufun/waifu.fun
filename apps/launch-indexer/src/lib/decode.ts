/**
 * Pure event decoder. Splits the "fetch RPC logs" concern from the "decode a
 * raw log into a typed envelope" concern so that unit tests can exercise the
 * decoder against hand-crafted topic/data pairs without any network.
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
	"Deposited",
	"Withdrawn",
	"Closed",
	"Launched",
	"RefundsEnabled",
	"Refunded",
	"Claimed",
	"BundleExecuted",
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
					creator: args.creator as `0x${string}`,
					token: args.token as `0x${string}`,
					vault: args.vault as `0x${string}`,
					router: args.router as `0x${string}`,
					taxSplitter: args.taxSplitter as `0x${string}`,
					treasuryReserve: args.treasuryReserve as `0x${string}`,
					tier: Number(args.tier as bigint | number),
					presaleCap: bn(args.presaleCap),
					v2BuyBnb: bn(args.v2BuyBnb),
					vestingEnabled: Boolean(args.vestingEnabled),
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

		case "Launched":
			return {
				...base,
				eventName: "Launched",
				data: {
					token: args.token as `0x${string}`,
					totalBnb: bn(args.totalBnb),
					launchTimestamp: bn(args.launchTimestamp),
				},
			};

		case "RefundsEnabled":
			return {
				...base,
				eventName: "RefundsEnabled",
				data: {},
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
					newTotal: bn(args.newTotal),
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
					flapToken: args.flapToken as `0x${string}`,
					v2Pair: args.v2Pair as `0x${string}`,
					curveFillBnb: bn(args.curveFillBnb),
					v2BuyBnb: bn(args.v2BuyBnb),
					tokensFromV2: bn(args.tokensFromV2),
					tokensBurned: bn(args.tokensBurned),
					tokensToTax: bn(args.tokensToTax),
					openMcBnb: bn(args.openMcBnb),
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
