import type { Address, Hex, Log } from "viem";
import { parseEventLogs } from "viem";

const transferEventAbi = [
	{
		type: "event",
		name: "Transfer",
		inputs: [
			{ indexed: true, name: "from", type: "address" },
			{ indexed: true, name: "to", type: "address" },
			{ indexed: false, name: "value", type: "uint256" },
		],
	},
] as const;

export interface SwapLog {
	address: Address;
	topics: readonly Hex[];
	data: Hex;
}

export interface ExtractSwapAmountOutInput {
	logs: readonly SwapLog[];
	recipient: Address;
	tokenOut: Address;
}

/**
 * Sum the tokenOut delivered to `recipient` across the receipt's Transfer logs.
 *
 * Returns `null` if no matching Transfer is found (e.g. native-out unwrap path,
 * which the caller should handle separately via the WBNB Withdrawal event).
 */
export const extractSwapAmountOut = ({ logs, recipient, tokenOut }: ExtractSwapAmountOutInput): bigint | null => {
	const transfers = parseEventLogs({
		abi: transferEventAbi,
		logs: logs as unknown as Log[],
		eventName: "Transfer",
	});

	const tokenOutLower = tokenOut.toLowerCase();
	const recipientLower = recipient.toLowerCase();

	let total = 0n;
	let matched = false;
	for (const log of transfers) {
		if (log.address.toLowerCase() !== tokenOutLower) continue;
		if (log.args.to.toLowerCase() !== recipientLower) continue;
		total += log.args.value;
		matched = true;
	}

	return matched ? total : null;
};
