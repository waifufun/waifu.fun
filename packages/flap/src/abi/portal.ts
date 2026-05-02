import type { Abi } from "viem";

/**
 * First-pass Flap Portal ABI surface for waifu-core.
 *
 * Source of truth:
 * - docs.flap.sh deployed ABI attachment referenced from the BSC docs
 * - narrowed to the methods/events waifu-core needs immediately
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
					{
						name: "dexThresh",
						type: "uint8",
						internalType: "enum IPortalCommonTypes.DexThreshType",
					},
					{ name: "salt", type: "bytes32", internalType: "bytes32" },
					{ name: "taxRate", type: "uint16", internalType: "uint16" },
					{
						name: "migratorType",
						type: "uint8",
						internalType: "enum IPortalTypes.MigratorType",
					},
					{ name: "quoteToken", type: "address", internalType: "address" },
					{ name: "quoteAmt", type: "uint256", internalType: "uint256" },
					{ name: "beneficiary", type: "address", internalType: "address" },
					{ name: "permitData", type: "bytes", internalType: "bytes" },
					{ name: "extensionID", type: "bytes32", internalType: "bytes32" },
					{ name: "extensionData", type: "bytes", internalType: "bytes" },
					{ name: "dexId", type: "uint8", internalType: "enum IPortalTypes.DEXId" },
					{
						name: "lpFeeProfile",
						type: "uint8",
						internalType: "enum IPortalTypes.V3LPFeeProfile",
					},
					{ name: "taxDuration", type: "uint64", internalType: "uint64" },
					{
						name: "antiFarmerDuration",
						type: "uint64",
						internalType: "uint64",
					},
					{ name: "mktBps", type: "uint16", internalType: "uint16" },
					{ name: "deflationBps", type: "uint16", internalType: "uint16" },
					{ name: "dividendBps", type: "uint16", internalType: "uint16" },
					{ name: "lpBps", type: "uint16", internalType: "uint16" },
					{
						name: "minimumShareBalance",
						type: "uint256",
						internalType: "uint256",
					},
				],
			},
		],
		outputs: [{ name: "token", type: "address", internalType: "address" }],
	},
	{
		type: "function",
		name: "getTokenV7",
		stateMutability: "view",
		inputs: [{ name: "token", type: "address", internalType: "address" }],
		outputs: [
			{
				name: "state",
				type: "tuple",
				internalType: "struct IPortalTypes.TokenStateV7",
				components: [
					{
						name: "status",
						type: "uint8",
						internalType: "enum IPortalTypes.TokenStatus",
					},
					{ name: "reserve", type: "uint256", internalType: "uint256" },
					{
						name: "circulatingSupply",
						type: "uint256",
						internalType: "uint256",
					},
					{ name: "price", type: "uint256", internalType: "uint256" },
					{
						name: "tokenVersion",
						type: "uint8",
						internalType: "enum IPortalTypes.TokenVersion",
					},
					{ name: "r", type: "uint256", internalType: "uint256" },
					{ name: "h", type: "uint256", internalType: "uint256" },
					{ name: "k", type: "uint256", internalType: "uint256" },
					{
						name: "dexSupplyThresh",
						type: "uint256",
						internalType: "uint256",
					},
					{
						name: "quoteTokenAddress",
						type: "address",
						internalType: "address",
					},
					{
						name: "nativeToQuoteSwapEnabled",
						type: "bool",
						internalType: "bool",
					},
					{ name: "extensionID", type: "bytes32", internalType: "bytes32" },
					{ name: "taxRate", type: "uint256", internalType: "uint256" },
					{ name: "pool", type: "address", internalType: "address" },
					{ name: "progress", type: "uint256", internalType: "uint256" },
					{
						name: "lpFeeProfile",
						type: "uint8",
						internalType: "enum IPortalTypes.V3LPFeeProfile",
					},
					{ name: "dexId", type: "uint8", internalType: "enum IPortalTypes.DEXId" },
				],
			},
		],
	},
	{
		type: "function",
		name: "quoteExactInput",
		stateMutability: "nonpayable",
		inputs: [
			{
				name: "params",
				type: "tuple",
				internalType: "struct IPortalTradeV2.QuoteExactInputParams",
				components: [
					{ name: "inputToken", type: "address", internalType: "address" },
					{ name: "outputToken", type: "address", internalType: "address" },
					{ name: "inputAmount", type: "uint256", internalType: "uint256" },
				],
			},
		],
		outputs: [{ name: "outputAmount", type: "uint256", internalType: "uint256" }],
	},
	{
		type: "function",
		name: "swapExactInput",
		stateMutability: "payable",
		inputs: [
			{
				name: "params",
				type: "tuple",
				internalType: "struct IPortalTradeV2.ExactInputParams",
				components: [
					{ name: "inputToken", type: "address", internalType: "address" },
					{ name: "outputToken", type: "address", internalType: "address" },
					{ name: "inputAmount", type: "uint256", internalType: "uint256" },
					{
						name: "minOutputAmount",
						type: "uint256",
						internalType: "uint256",
					},
					{ name: "permitData", type: "bytes", internalType: "bytes" },
				],
			},
		],
		outputs: [{ name: "outputAmount", type: "uint256", internalType: "uint256" }],
	},
	{
		type: "event",
		name: "TokenCreated",
		anonymous: false,
		inputs: [
			{ name: "ts", type: "uint256", indexed: false, internalType: "uint256" },
			{
				name: "creator",
				type: "address",
				indexed: false,
				internalType: "address",
			},
			{
				name: "nonce",
				type: "uint256",
				indexed: false,
				internalType: "uint256",
			},
			{
				name: "token",
				type: "address",
				indexed: false,
				internalType: "address",
			},
			{ name: "name", type: "string", indexed: false, internalType: "string" },
			{
				name: "symbol",
				type: "string",
				indexed: false,
				internalType: "string",
			},
			{ name: "meta", type: "string", indexed: false, internalType: "string" },
		],
	},
	{
		type: "event",
		name: "TokenBought",
		anonymous: false,
		inputs: [
			{ name: "ts", type: "uint256", indexed: false, internalType: "uint256" },
			{ name: "token", type: "address", indexed: false, internalType: "address" },
			{ name: "buyer", type: "address", indexed: false, internalType: "address" },
			{ name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
			{ name: "eth", type: "uint256", indexed: false, internalType: "uint256" },
			{ name: "fee", type: "uint256", indexed: false, internalType: "uint256" },
			{
				name: "postPrice",
				type: "uint256",
				indexed: false,
				internalType: "uint256",
			},
		],
	},
	{
		type: "event",
		name: "TokenSold",
		anonymous: false,
		inputs: [
			{ name: "ts", type: "uint256", indexed: false, internalType: "uint256" },
			{ name: "token", type: "address", indexed: false, internalType: "address" },
			{ name: "seller", type: "address", indexed: false, internalType: "address" },
			{ name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
			{ name: "eth", type: "uint256", indexed: false, internalType: "uint256" },
			{ name: "fee", type: "uint256", indexed: false, internalType: "uint256" },
			{
				name: "postPrice",
				type: "uint256",
				indexed: false,
				internalType: "uint256",
			},
		],
	},
	{
		type: "event",
		name: "FlapTokenProgressChanged",
		anonymous: false,
		inputs: [
			{ name: "token", type: "address", indexed: false, internalType: "address" },
			{
				name: "newProgress",
				type: "uint256",
				indexed: false,
				internalType: "uint256",
			},
		],
	},
	{
		type: "event",
		name: "LaunchedToDEX",
		anonymous: false,
		inputs: [
			{ name: "token", type: "address", indexed: false, internalType: "address" },
			{ name: "pool", type: "address", indexed: false, internalType: "address" },
			{ name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
			{ name: "eth", type: "uint256", indexed: false, internalType: "uint256" },
		],
	},
	{
		type: "event",
		name: "TokenCurveSet",
		anonymous: false,
		inputs: [
			{ name: "token", type: "address", indexed: false, internalType: "address" },
			{ name: "curve", type: "address", indexed: false, internalType: "address" },
			{
				name: "curveParameter",
				type: "uint256",
				indexed: false,
				internalType: "uint256",
			},
		],
	},
	{
		type: "event",
		name: "TokenCurveSetV2",
		anonymous: false,
		inputs: [
			{ name: "token", type: "address", indexed: false, internalType: "address" },
			{ name: "r", type: "uint256", indexed: false, internalType: "uint256" },
			{ name: "h", type: "uint256", indexed: false, internalType: "uint256" },
			{ name: "k", type: "uint256", indexed: false, internalType: "uint256" },
		],
	},
	{
		type: "event",
		name: "TokenDexSupplyThreshSet",
		anonymous: false,
		inputs: [
			{ name: "token", type: "address", indexed: false, internalType: "address" },
			{
				name: "dexSupplyThresh",
				type: "uint256",
				indexed: false,
				internalType: "uint256",
			},
		],
	},
	{
		type: "event",
		name: "TokenQuoteSet",
		anonymous: false,
		inputs: [
			{ name: "token", type: "address", indexed: false, internalType: "address" },
			{
				name: "quoteToken",
				type: "address",
				indexed: false,
				internalType: "address",
			},
		],
	},
	{
		type: "event",
		name: "TokenMigratorSet",
		anonymous: false,
		inputs: [
			{ name: "token", type: "address", indexed: false, internalType: "address" },
			{
				name: "migratorType",
				type: "uint8",
				indexed: false,
				internalType: "enum IPortalTypes.MigratorType",
			},
		],
	},
	{
		type: "event",
		name: "TokenVersionSet",
		anonymous: false,
		inputs: [
			{ name: "token", type: "address", indexed: false, internalType: "address" },
			{
				name: "version",
				type: "uint8",
				indexed: false,
				internalType: "enum IPortalTypes.TokenVersion",
			},
		],
	},
	{
		type: "event",
		name: "FlapTokenTaxSet",
		anonymous: false,
		inputs: [
			{ name: "token", type: "address", indexed: false, internalType: "address" },
			{ name: "tax", type: "uint256", indexed: false, internalType: "uint256" },
		],
	},
	{
		type: "event",
		name: "TokenExtensionEnabled",
		anonymous: false,
		inputs: [
			{ name: "token", type: "address", indexed: false, internalType: "address" },
			{
				name: "extensionID",
				type: "bytes32",
				indexed: false,
				internalType: "bytes32",
			},
			{
				name: "extensionAddress",
				type: "address",
				indexed: false,
				internalType: "address",
			},
			{ name: "version", type: "uint8", indexed: false, internalType: "uint8" },
		],
	},
	{
		type: "event",
		name: "TokenDexPreferenceSet",
		anonymous: false,
		inputs: [
			{ name: "token", type: "address", indexed: false, internalType: "address" },
			{
				name: "dexId",
				type: "uint8",
				indexed: false,
				internalType: "enum IPortalTypes.DEXId",
			},
			{
				name: "lpFeeProfile",
				type: "uint8",
				indexed: false,
				internalType: "enum IPortalTypes.V3LPFeeProfile",
			},
		],
	},
	{
		type: "event",
		name: "FlapTokenStaged",
		anonymous: false,
		inputs: [
			{ name: "ts", type: "uint256", indexed: false, internalType: "uint256" },
			{
				name: "creator",
				type: "address",
				indexed: false,
				internalType: "address",
			},
			{ name: "token", type: "address", indexed: false, internalType: "address" },
		],
	},
	{
		type: "event",
		name: "FlapTokenCirculatingSupplyChanged",
		anonymous: false,
		inputs: [
			{ name: "token", type: "address", indexed: false, internalType: "address" },
			{
				name: "newSupply",
				type: "uint256",
				indexed: false,
				internalType: "uint256",
			},
		],
	},
] as const satisfies Abi;
