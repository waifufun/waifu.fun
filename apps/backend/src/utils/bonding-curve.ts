import { SolanaNetworkIds } from "@autofun/types";
import { SolanaRpcProvider } from "@autofun/rpc";

export const SEED_BONDING_CURVE = "bonding_curve";
import { PublicKey } from "@solana/web3.js";

const addressConstantsV1 = {
	[SolanaNetworkIds.Mainnet]: "autoUmixaMaYKFjexMpQuBpNYntgbkzCo2b1ZqUaAZ5",
	[SolanaNetworkIds.Devnet]: "autoUmixaMaYKFjexMpQuBpNYntgbkzCo2b1ZqUaAZ5",
};

const addressConstantsV2 = {
	[SolanaNetworkIds.Mainnet]: "autoiNVyGniA5dosggHy34BZYimthNzLy6WXL7qwzPA",
	[SolanaNetworkIds.Devnet]: "TeStFsfeHHNsCRNo9WaF6eyo5Fzwm2Yiq5mXfhknvxS",
};

export interface BondingCurveData {
	reserveAmount: number;
	reserveLamport: number;
	virtualReserves: number;
	liquidity: number;
	currentPrice: number;
	marketCapUSD: number;
	tokenPriceUSD: number;
	curveProgress: number;
	curveLimit: number;
}

export async function getBondingCurveData(
	contractAddress: string,
	chainId: SolanaNetworkIds,
	totalSupply: number,
	decimals: number,
	version = 2,
): Promise<BondingCurveData> {
	const rpc = new SolanaRpcProvider(chainId);
	const bondingCurveInfo = await rpc.getBondingCurveInfo([contractAddress], version);
	if (!bondingCurveInfo || bondingCurveInfo.length === 0 || !bondingCurveInfo[0]) {
		throw new Error(`Bonding curve account not found for token ${contractAddress}`);
	}
	const info = bondingCurveInfo[0];
	const solPrice = info.priceSOL || 0;
	const virtualReserves = Number(process.env.VIRTUAL_RESERVES) || 100000000;
	const curveLimit = info.curveLimit || Number(process.env.CURVE_LIMIT) || 1000000000;
	const currentPrice = info.priceSOL || 0;
	const marketCapUSD = info.marketCapUSD || 0;
	const tokenPriceUSD = info.priceUsd || 0;
	const curveProgress = info.curveProgress || 0;

	return {
		reserveAmount: info.reserveToken || 0,
		reserveLamport: info.reserveLamport || 0,
		virtualReserves,
		liquidity: info.marketCapSOL || 0,
		currentPrice,
		marketCapUSD,
		tokenPriceUSD,
		curveProgress,
		curveLimit,
	};
}

export const getGlobalVault = (chainId: SolanaNetworkIds, version: 1 | 2) => {
	const addressConstants = version === 1 ? addressConstantsV1 : addressConstantsV2;
	const address = addressConstants[chainId];
	if (!address) {
		throw new Error(`No global vault address found for chainId ${chainId} and version ${version}`);
	}
	const programId = new PublicKey(address);

	const [globalVault] = PublicKey.findProgramAddressSync([Buffer.from("global")], programId);
	return globalVault;
};
