import { type Address, type PublicClient, getAddress, parseAbi } from "viem";
import { getNavPublicClient } from "../chains.js";
import type { EnumerationResult, Holding } from "../types.js";

type PcsV3LpWallet = Pick<Holding, "walletId" | "walletAddress" | "walletLabel" | "walletRole" | "chain">;

export type PcsV3LpEnumeratorDeps = {
	getClient?: () => PublicClient;
	npmAddress?: Address;
};

const PCS_V3_NPM_ADDRESS = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364" as const;

const NPM_ABI = parseAbi([
	"function balanceOf(address owner) view returns (uint256)",
	"function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
	"function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
]);

type PcsV3Position = readonly [
	bigint,
	Address,
	Address,
	Address,
	number,
	number,
	number,
	bigint,
	bigint,
	bigint,
	bigint,
	bigint,
];

export async function enumeratePcsV3Lp(
	wallet: PcsV3LpWallet,
	deps: PcsV3LpEnumeratorDeps = {},
): Promise<EnumerationResult<Holding>> {
	try {
		const client = deps.getClient?.() ?? getNavPublicClient("bsc");
		const npmAddress = deps.npmAddress ?? PCS_V3_NPM_ADDRESS;
		const owner = getAddress(wallet.walletAddress) as Address;
		const balance = await client.readContract({
			address: npmAddress,
			abi: NPM_ABI,
			functionName: "balanceOf",
			args: [owner],
		});
		if (balance === 0n) return { holdings: [], stale: [] };

		const holdings: Holding[] = [];
		for (let index = 0n; index < balance; index++) {
			const tokenId = await client.readContract({
				address: npmAddress,
				abi: NPM_ABI,
				functionName: "tokenOfOwnerByIndex",
				args: [owner, index],
			});
			const position = (await client.readContract({
				address: npmAddress,
				abi: NPM_ABI,
				functionName: "positions",
				args: [tokenId],
			})) as PcsV3Position;
			const [, , token0, token1, fee, tickLower, tickUpper, liquidity, , , tokensOwed0, tokensOwed1] = position;
			holdings.push({
				...wallet,
				asset: `PCS-V3-LP-${tokenId.toString()}`,
				contract: npmAddress.toLowerCase(),
				balance: 1,
				priceUsd: null,
				valueUsd: null,
				priced: false,
				kind: "lp",
				venue: "pancakeswap-v3",
				tokenId: tokenId.toString(),
				metadata: {
					token0: token0.toLowerCase(),
					token1: token1.toLowerCase(),
					fee,
					tickLower,
					tickUpper,
					liquidity: liquidity.toString(),
					tokensOwed0: tokensOwed0.toString(),
					tokensOwed1: tokensOwed1.toString(),
				},
			});
		}
		return { holdings, stale: [] };
	} catch (err) {
		return {
			holdings: [],
			stale: [{ source: "bsc:pancakeswap-v3-lp", reason: err instanceof Error ? err.message : String(err) }],
		};
	}
}

export const __privatePancakeV3Lp = { NPM_ABI, PCS_V3_NPM_ADDRESS };
