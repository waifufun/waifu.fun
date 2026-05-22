import { type Address, type PublicClient, getAddress } from "viem";
import { getNavPublicClient } from "../chains.js";
import type { TokenPrice } from "../types.js";

export const PANCAKE_V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865" as const;
export const PANCAKE_V3_WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" as const;
const FEES = [100, 500, 2500, 10000] as const;
const ZERO = "0x0000000000000000000000000000000000000000";
const Q96 = 2 ** 96;

const factoryAbi = [
	{
		type: "function",
		name: "getPool",
		stateMutability: "view",
		inputs: [
			{ name: "tokenA", type: "address" },
			{ name: "tokenB", type: "address" },
			{ name: "fee", type: "uint24" },
		],
		outputs: [{ name: "pool", type: "address" }],
	},
] as const;
const poolAbi = [
	{ type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
	{ type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
	{
		type: "function",
		name: "slot0",
		stateMutability: "view",
		inputs: [],
		outputs: [
			{ name: "sqrtPriceX96", type: "uint160" },
			{ name: "tick", type: "int24" },
			{ name: "observationIndex", type: "uint16" },
			{ name: "observationCardinality", type: "uint16" },
			{ name: "observationCardinalityNext", type: "uint16" },
			{ name: "feeProtocol", type: "uint32" },
			{ name: "unlocked", type: "bool" },
		],
	},
] as const;

export type PcsV3TwapDeps = { getClient?: () => PublicClient };

export async function fetchPcsV3TwapPriceUsd(
	contract: string,
	decimals: number,
	bnbUsd: number | null,
	deps: PcsV3TwapDeps = {},
): Promise<TokenPrice> {
	if (!bnbUsd || bnbUsd <= 0) return { priceUsd: null, priced: false, source: "unpriced" };
	try {
		const client = deps.getClient?.() ?? getNavPublicClient("bsc");
		const token = getAddress(contract);
		for (const fee of FEES) {
			const pool = (await client.readContract({
				address: PANCAKE_V3_FACTORY,
				abi: factoryAbi,
				functionName: "getPool",
				args: [token, PANCAKE_V3_WBNB, fee],
			})) as Address;
			if (!pool || pool.toLowerCase() === ZERO) continue;
			const [token0, slot0] = await Promise.all([
				client.readContract({ address: pool, abi: poolAbi, functionName: "token0" }) as Promise<Address>,
				client.readContract({ address: pool, abi: poolAbi, functionName: "slot0" }) as Promise<
					readonly [bigint, number, number, number, number, number, boolean]
				>,
			]);
			const sqrt = Number(slot0[0]);
			if (!Number.isFinite(sqrt) || sqrt <= 0) continue;
			const rawToken1PerToken0 = (sqrt / Q96) ** 2;
			const tokenIsToken0 = token0.toLowerCase() === token.toLowerCase();
			const decimalScale = 10 ** (decimals - 18);
			const wbnbPerToken = tokenIsToken0 ? rawToken1PerToken0 * decimalScale : (1 / rawToken1PerToken0) * decimalScale;
			const priceUsd = wbnbPerToken * bnbUsd;
			if (Number.isFinite(priceUsd) && priceUsd > 0) return { priceUsd, priced: true, source: "pcs-v3-twap" };
		}
		return { priceUsd: null, priced: false, source: "unpriced" };
	} catch {
		return { priceUsd: null, priced: false, source: "unpriced" };
	}
}
