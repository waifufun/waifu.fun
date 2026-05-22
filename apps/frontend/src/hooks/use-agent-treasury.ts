/**
 * useAgentTreasury - live readout of the AgentSafe's on-chain holdings.
 *
 * Reads BNB (native) + arbitrary ERC-20 balances in one wagmi batch with
 * `allowFailure: true` so a single token RPC blip doesn't blank the whole
 * panel. Polls on a 60s interval, cached by react-query keyed on the safe
 * address.
 *
 * Why this exists: pre-this-PR, the agent page showed AgentSafe BNB only
 * (via `<TreasuryPanelV2>` -> useBalance) and ignored the 100M $WAIFU
 * tokens the safe holds as the agent's treasury allocation. That hid half
 * of the actual treasury value.
 */
"use client";

import { type Address, formatEther, formatUnits, isAddress } from "viem";
import { useBalance, useReadContracts } from "wagmi";
import { bsc } from "wagmi/chains";

const TREASURY_POLL_MS = 60_000;

/** Minimal ERC-20 read ABI: name / symbol / decimals / balanceOf. */
const erc20ReadAbi = [
	{
		type: "function",
		stateMutability: "view",
		name: "name",
		inputs: [],
		outputs: [{ name: "", type: "string" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "symbol",
		inputs: [],
		outputs: [{ name: "", type: "string" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "decimals",
		inputs: [],
		outputs: [{ name: "", type: "uint8" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "balanceOf",
		inputs: [{ name: "", type: "address" }],
		outputs: [{ name: "", type: "uint256" }],
	},
] as const;

export interface TokenSpec {
	address: Address;
	/** Optional override: skip a `symbol()` read when we already know it. */
	symbol?: string;
	/** Optional override: skip a `decimals()` read when we already know it. */
	decimals?: number;
}

export interface TreasuryTokenHolding {
	kind: "erc20";
	address: Address;
	symbol: string;
	decimals: number;
	balance: bigint;
	/** Human-readable balance as a string with full precision. */
	formatted: string;
}

export interface TreasuryNativeHolding {
	kind: "native";
	symbol: "BNB";
	decimals: 18;
	balance: bigint;
	formatted: string;
}

export type TreasuryHolding = TreasuryNativeHolding | TreasuryTokenHolding;

export interface AgentTreasurySnapshot {
	safe: Address | null;
	native: TreasuryNativeHolding | null;
	tokens: TreasuryTokenHolding[];
	/** True while either read is loading; safe to gate skeleton UI on this. */
	isLoading: boolean;
	/** True if either read returned an error from wagmi (per-row failures already tolerated). */
	hasError: boolean;
}

/**
 * Pull AgentSafe holdings: native BNB + a configurable list of ERC-20s.
 *
 * Always pass `allowFailure: true` so a token whose ABI surface fails
 * (non-standard `decimals`, contract self-destructed, RPC node returns
 * malformed data) does not nuke the entire treasury panel.
 */
export function useAgentTreasury(safe: Address | null | undefined, tokens: TokenSpec[]): AgentTreasurySnapshot {
	const safeValid = !!safe && isAddress(safe);
	const safeAddress = safeValid ? (safe as Address) : null;
	const trackedTokens = tokens.filter((t) => isAddress(t.address));

	// Native BNB via useBalance (handles its own caching + polling).
	const native = useBalance({
		address: safeAddress ?? undefined,
		chainId: bsc.id,
		query: {
			enabled: safeValid,
			refetchInterval: TREASURY_POLL_MS,
		},
	});

	// Per-token reads: for each token in `tokens`, read symbol/decimals/balance.
	// We skip the symbol/decimals reads when overrides were provided.
	const contracts = safeAddress
		? trackedTokens.flatMap((t) => {
				const wantSymbol = !t.symbol;
				const wantDecimals = t.decimals === undefined;
				const calls: Array<{
					address: Address;
					abi: typeof erc20ReadAbi;
					functionName: "symbol" | "decimals" | "balanceOf";
					args?: readonly [Address];
					chainId: number;
				}> = [
					{
						address: t.address,
						abi: erc20ReadAbi,
						functionName: "balanceOf",
						args: [safeAddress] as const,
						chainId: bsc.id,
					},
				];
				if (wantSymbol) calls.push({ address: t.address, abi: erc20ReadAbi, functionName: "symbol", chainId: bsc.id });
				if (wantDecimals)
					calls.push({ address: t.address, abi: erc20ReadAbi, functionName: "decimals", chainId: bsc.id });
				return calls;
			})
		: [];

	const reads = useReadContracts({
		allowFailure: true, // per-row tolerance per the constraint in CLAUDE.md
		// Wagmi's contracts prop wants a homogeneous tuple; our list is uniform
		// in shape but heterogeneous in args, which trips strict tuple inference.
		// The runtime contract is consistent, cast through unknown.
		contracts: contracts as unknown as readonly never[],
		query: {
			enabled: safeValid && contracts.length > 0,
			refetchInterval: TREASURY_POLL_MS,
			staleTime: 30_000,
		},
	});

	const nativeHolding: TreasuryNativeHolding | null = native.data
		? {
				kind: "native",
				symbol: "BNB",
				decimals: 18,
				balance: native.data.value,
				formatted: formatEther(native.data.value),
			}
		: null;

	const tokenHoldings: TreasuryTokenHolding[] = [];
	// The cast through unknown is paired with the same cast we did on the
	// `contracts` input - allowFailure:true rows always shape as { status,
	// result, error }, but the heterogeneous tuple inference trips this in
	// strict mode. Treat each row as the runtime contract guarantees.
	type ReadRow = { status: "success"; result: unknown } | { status: "failure"; error: Error };
	const readRows = (reads.data ?? null) as readonly ReadRow[] | null;
	if (readRows && safeAddress) {
		// Walk the read results in the same order we queued them. Per-token
		// stride varies based on whether overrides were provided.
		let cursor = 0;
		for (const t of trackedTokens) {
			const wantSymbol = !t.symbol;
			const wantDecimals = t.decimals === undefined;

			const balRow = readRows[cursor++];
			const symbolRow = wantSymbol ? readRows[cursor++] : undefined;
			const decimalsRow = wantDecimals ? readRows[cursor++] : undefined;

			const balance = balRow && balRow.status === "success" && typeof balRow.result === "bigint" ? balRow.result : 0n;
			const symbol =
				t.symbol ??
				(symbolRow && symbolRow.status === "success" && typeof symbolRow.result === "string"
					? symbolRow.result
					: "TOKEN");
			const decimals =
				t.decimals ??
				(decimalsRow && decimalsRow.status === "success" && typeof decimalsRow.result === "number"
					? decimalsRow.result
					: 18);

			tokenHoldings.push({
				kind: "erc20",
				address: t.address,
				symbol,
				decimals,
				balance,
				formatted: formatUnits(balance, decimals),
			});
		}
	}

	return {
		safe: safeAddress,
		native: nativeHolding,
		tokens: tokenHoldings,
		isLoading: native.isLoading || reads.isLoading,
		hasError: Boolean(native.isError) || Boolean(reads.isError),
	};
}
