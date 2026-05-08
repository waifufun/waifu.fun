"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address, type Log, isAddress } from "viem";
import { usePublicClient } from "wagmi";
import { bsc } from "wagmi/chains";

import { launchVaultAbi } from "@/lib/launch-vault/abi";
import type { DepositorEvent } from "@/lib/launch-vault/api";

const RECENT_BLOCKS = 50_000n; // ~1.7 days on bsc — covers a 24h round
const REFETCH_MS = 15_000;
const FEED_LIMIT = 10;

type DecodedLog = Log<bigint, number, false> & {
	eventName?: string;
	args?: Record<string, unknown>;
};

/**
 * Falls back to direct event log queries when the backend depositors endpoint
 * is unavailable. Pulls the last `RECENT_BLOCKS` of `Deposited` + `Withdrawn`
 * events, sorts by block, and reduces to the activity-feed shape.
 */
export function useVaultEventsFallback(vault: Address | undefined, enabled: boolean) {
	const client = usePublicClient({ chainId: bsc.id });

	return useQuery<DepositorEvent[]>({
		queryKey: ["vault-events-fallback", vault ?? null],
		enabled: Boolean(vault) && Boolean(client) && enabled && (vault ? isAddress(vault) : false),
		refetchInterval: REFETCH_MS,
		staleTime: 5_000,
		queryFn: async () => {
			if (!client || !vault) return [];
			const head = await client.getBlockNumber();
			const fromBlock = head > RECENT_BLOCKS ? head - RECENT_BLOCKS : 0n;
			const [deposits, withdrawals] = await Promise.all([
				client.getContractEvents({
					address: vault,
					abi: launchVaultAbi,
					eventName: "Deposited",
					fromBlock,
					toBlock: head,
				}),
				client.getContractEvents({
					address: vault,
					abi: launchVaultAbi,
					eventName: "Withdrawn",
					fromBlock,
					toBlock: head,
				}),
			]);

			const all: DepositorEvent[] = [];

			for (const log of deposits as DecodedLog[]) {
				const user = String(log.args?.user ?? "");
				const amount = (log.args?.amount as bigint | undefined) ?? 0n;
				const ts = await blockTimestamp(client, log.blockNumber);
				all.push({
					kind: "deposit",
					address: user,
					amountWei: amount.toString(),
					timestamp: ts,
					txHash: log.transactionHash,
				});
			}
			for (const log of withdrawals as DecodedLog[]) {
				const user = String(log.args?.user ?? "");
				const refund = (log.args?.refund as bigint | undefined) ?? 0n;
				const ts = await blockTimestamp(client, log.blockNumber);
				all.push({
					kind: "withdraw",
					address: user,
					amountWei: refund.toString(),
					timestamp: ts,
					txHash: log.transactionHash,
				});
			}

			all.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
			return all.slice(0, FEED_LIMIT);
		},
	});
}

const blockTimestampCache = new Map<string, string>();

async function blockTimestamp(
	client: NonNullable<ReturnType<typeof usePublicClient>>,
	blockNumber: bigint | null | undefined,
): Promise<string> {
	if (blockNumber === null || blockNumber === undefined) return new Date().toISOString();
	const key = `${client.chain?.id ?? "x"}:${blockNumber.toString()}`;
	const hit = blockTimestampCache.get(key);
	if (hit) return hit;
	try {
		const block = await client.getBlock({ blockNumber });
		const iso = new Date(Number(block.timestamp) * 1000).toISOString();
		blockTimestampCache.set(key, iso);
		return iso;
	} catch {
		return new Date().toISOString();
	}
}
