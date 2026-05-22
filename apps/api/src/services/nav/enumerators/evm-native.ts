import { type PublicClient, formatEther, getAddress } from "viem";
import { NAV_CHAIN_CONFIG, getNavPublicClient } from "../chains.js";
import type { EnumerationResult, EvmNavChain, NativeBalance } from "../types.js";

export type EvmNativeEnumeratorDeps = {
	getClient?: (chain: EvmNavChain) => PublicClient;
};

export async function enumerateEvmNativeBalance(
	walletAddress: string,
	chain: EvmNavChain,
	deps: EvmNativeEnumeratorDeps = {},
): Promise<EnumerationResult<NativeBalance>> {
	try {
		const client = deps.getClient?.(chain) ?? getNavPublicClient(chain);
		const raw = await client.getBalance({ address: getAddress(walletAddress) });
		const balance = Number(formatEther(raw));
		if (balance <= 0) return { holdings: [], stale: [] };
		return {
			holdings: [{ asset: NAV_CHAIN_CONFIG[chain]!.nativeSymbol, balance, raw: raw.toString() }],
			stale: [],
		};
	} catch (err) {
		return {
			holdings: [],
			stale: [{ source: `${chain}:evm-native`, reason: err instanceof Error ? err.message : String(err) }],
		};
	}
}
