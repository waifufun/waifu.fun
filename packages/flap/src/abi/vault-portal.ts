import type { Abi } from "viem";

export const vaultPortalAbi = [
	{
		type: "function",
		name: "newTokenV6WithVault",
		stateMutability: "payable",
		inputs: [
			{
				name: "params",
				type: "tuple",
				internalType: "struct IVaultPortal.NewTokenV6WithVaultParams",
				components: [
					{ name: "name", type: "string", internalType: "string" },
					{ name: "symbol", type: "string", internalType: "string" },
					{ name: "meta", type: "string", internalType: "string" },
					{ name: "dexThresh", type: "uint8", internalType: "enum IPortalCommonTypes.DexThreshType" },
					{ name: "salt", type: "bytes32", internalType: "bytes32" },
					{ name: "migratorType", type: "uint8", internalType: "enum IPortalTypes.MigratorType" },
					{ name: "quoteToken", type: "address", internalType: "address" },
					{ name: "quoteAmt", type: "uint256", internalType: "uint256" },
					{ name: "permitData", type: "bytes", internalType: "bytes" },
					{ name: "extensionID", type: "bytes32", internalType: "bytes32" },
					{ name: "extensionData", type: "bytes", internalType: "bytes" },
					{ name: "dexId", type: "uint8", internalType: "enum IPortalTypes.DEXId" },
					{ name: "lpFeeProfile", type: "uint8", internalType: "enum IPortalTypes.V3LPFeeProfile" },
					{ name: "buyTaxRate", type: "uint16", internalType: "uint16" },
					{ name: "sellTaxRate", type: "uint16", internalType: "uint16" },
					{ name: "taxDuration", type: "uint64", internalType: "uint64" },
					{ name: "antiFarmerDuration", type: "uint64", internalType: "uint64" },
					{ name: "mktBps", type: "uint16", internalType: "uint16" },
					{ name: "deflationBps", type: "uint16", internalType: "uint16" },
					{ name: "dividendBps", type: "uint16", internalType: "uint16" },
					{ name: "lpBps", type: "uint16", internalType: "uint16" },
					{ name: "minimumShareBalance", type: "uint256", internalType: "uint256" },
					{ name: "dividendToken", type: "address", internalType: "address" },
					{ name: "commissionReceiver", type: "address", internalType: "address" },
					{ name: "tokenVersion", type: "uint8", internalType: "enum IPortalTypes.TokenVersion" },
					{ name: "vaultFactory", type: "address", internalType: "address" },
					{ name: "vaultData", type: "bytes", internalType: "bytes" },
				],
			},
		],
		outputs: [{ name: "token", type: "address", internalType: "address" }],
	},
	{
		type: "event",
		name: "FlapTaxVaultTokenCreated",
		anonymous: false,
		inputs: [
			{ name: "token", type: "address", indexed: true, internalType: "address" },
			{ name: "vault", type: "address", indexed: true, internalType: "address" },
			{ name: "vaultFactory", type: "address", indexed: true, internalType: "address" },
		],
	},
] as const satisfies Abi;

export const splitVaultAbi = [
	{
		type: "function",
		name: "getRecipientsInfo",
		stateMutability: "view",
		inputs: [],
		outputs: [
			{
				name: "",
				type: "tuple[]",
				components: [
					{ name: "recipient", type: "address" },
					{ name: "bps", type: "uint16" },
				],
			},
		],
	},
	{
		type: "function",
		name: "recipients",
		stateMutability: "view",
		inputs: [{ name: "", type: "uint256" }],
		outputs: [
			{ name: "recipient", type: "address" },
			{ name: "bps", type: "uint16" },
		],
	},
	{
		type: "function",
		name: "userBalances",
		stateMutability: "view",
		inputs: [{ name: "", type: "address" }],
		outputs: [{ name: "", type: "uint256" }],
	},
	{ type: "function", name: "taxToken", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
	{ type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
	{ type: "function", name: "TOTAL_BPS", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint16" }] },
] as const satisfies Abi;
