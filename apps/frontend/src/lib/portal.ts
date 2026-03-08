/**
 * Flap Portal contract helpers for BSC token launching.
 * Minimal ABI + param builder for newTokenV5.
 */
import { zeroAddress, zeroHash, parseEther, decodeEventLog, type Log } from "viem";

export const PORTAL_ADDRESS = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0" as const;

/**
 * Minimal Portal ABI — only newTokenV5 + TokenCreated event.
 */
export const portalAbi = [
	{
		type: "function",
		name: "newTokenV5",
		stateMutability: "payable",
		inputs: [
			{
				name: "params",
				type: "tuple",
				internalType: "struct IPortalTypes.NewTokenV5Params",
				components: [
					{ name: "name", type: "string", internalType: "string" },
					{ name: "symbol", type: "string", internalType: "string" },
					{ name: "meta", type: "string", internalType: "string" },
					{ name: "dexThresh", type: "uint8", internalType: "enum IPortalCommonTypes.DexThreshType" },
					{ name: "salt", type: "bytes32", internalType: "bytes32" },
					{ name: "taxRate", type: "uint16", internalType: "uint16" },
					{ name: "migratorType", type: "uint8", internalType: "enum IPortalTypes.MigratorType" },
					{ name: "quoteToken", type: "address", internalType: "address" },
					{ name: "quoteAmt", type: "uint256", internalType: "uint256" },
					{ name: "beneficiary", type: "address", internalType: "address" },
					{ name: "permitData", type: "bytes", internalType: "bytes" },
					{ name: "extensionID", type: "bytes32", internalType: "bytes32" },
					{ name: "extensionData", type: "bytes", internalType: "bytes" },
					{ name: "dexId", type: "uint8", internalType: "enum IPortalTypes.DEXId" },
					{ name: "lpFeeProfile", type: "uint8", internalType: "enum IPortalTypes.V3LPFeeProfile" },
					{ name: "taxDuration", type: "uint64", internalType: "uint64" },
					{ name: "antiFarmerDuration", type: "uint64", internalType: "uint64" },
					{ name: "mktBps", type: "uint16", internalType: "uint16" },
					{ name: "deflationBps", type: "uint16", internalType: "uint16" },
					{ name: "dividendBps", type: "uint16", internalType: "uint16" },
					{ name: "lpBps", type: "uint16", internalType: "uint16" },
					{ name: "minimumShareBalance", type: "uint256", internalType: "uint256" },
				],
			},
		],
		outputs: [{ name: "token", type: "address", internalType: "address" }],
	},
	{
		type: "event",
		name: "TokenCreated",
		anonymous: false,
		inputs: [
			{ name: "ts", type: "uint256", indexed: false, internalType: "uint256" },
			{ name: "creator", type: "address", indexed: false, internalType: "address" },
			{ name: "nonce", type: "uint256", indexed: false, internalType: "uint256" },
			{ name: "token", type: "address", indexed: false, internalType: "address" },
			{ name: "name", type: "string", indexed: false, internalType: "string" },
			{ name: "symbol", type: "string", indexed: false, internalType: "string" },
			{ name: "meta", type: "string", indexed: false, internalType: "string" },
		],
	},
] as const;

/**
 * Build params for Portal.newTokenV5 with sensible defaults.
 */
export function buildNewTokenV5Params({
	name,
	symbol,
	meta,
	salt,
	beneficiary,
	taxRate = 0,
	buyAmountBnb = "0",
}: {
	name: string;
	symbol: string;
	meta: string;
	salt: `0x${string}`;
	beneficiary: `0x${string}`;
	taxRate?: number;
	buyAmountBnb?: string;
}) {
	return {
		name,
		symbol,
		meta,
		dexThresh: 0,
		salt,
		taxRate,
		migratorType: taxRate > 0 ? 1 : 0,
		quoteToken: zeroAddress,
		quoteAmt: buyAmountBnb && parseFloat(buyAmountBnb) > 0 ? parseEther(buyAmountBnb) : 0n,
		beneficiary,
		permitData: "0x" as `0x${string}`,
		extensionID: zeroHash,
		extensionData: "0x" as `0x${string}`,
		dexId: 0,
		lpFeeProfile: 0,
		taxDuration: 0n,
		antiFarmerDuration: 0n,
		mktBps: 0,
		deflationBps: 0,
		dividendBps: 0,
		lpBps: 0,
		minimumShareBalance: 0n,
	};
}

/**
 * Extract the created token address from a newTokenV5 tx receipt.
 * Decodes the TokenCreated event from the receipt logs.
 */
export function extractTokenAddressFromReceipt(logs: Log[]): string | null {
	for (const log of logs) {
		try {
			const decoded = decodeEventLog({
				abi: portalAbi,
				data: log.data,
				topics: log.topics,
			});
			if (decoded.eventName === "TokenCreated") {
				return (decoded.args as { token: string }).token;
			}
		} catch {
			// Not our event, skip
		}
	}
	return null;
}
