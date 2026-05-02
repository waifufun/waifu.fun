export const TokenManager2Abi = [
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "address",
				name: "previousAdmin",
				type: "address",
			},
			{
				indexed: false,
				internalType: "address",
				name: "newAdmin",
				type: "address",
			},
		],
		name: "AdminChanged",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "address",
				name: "beacon",
				type: "address",
			},
		],
		name: "BeaconUpgraded",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "uint256",
				name: "lockId",
				type: "uint256",
			},
		],
		name: "FeesCollected",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "uint8",
				name: "version",
				type: "uint8",
			},
		],
		name: "Initialized",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "nftId",
				type: "uint256",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "lockId",
				type: "uint256",
			},
		],
		name: "LPLock",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "address",
				name: "base",
				type: "address",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "offers",
				type: "uint256",
			},
			{
				indexed: false,
				internalType: "address",
				name: "quote",
				type: "address",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "funds",
				type: "uint256",
			},
		],
		name: "LiquidityAdded",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "address",
				name: "previousOwner",
				type: "address",
			},
			{
				indexed: true,
				internalType: "address",
				name: "newOwner",
				type: "address",
			},
		],
		name: "OwnershipTransferred",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "bytes32",
				name: "role",
				type: "bytes32",
			},
			{
				indexed: true,
				internalType: "bytes32",
				name: "previousAdminRole",
				type: "bytes32",
			},
			{
				indexed: true,
				internalType: "bytes32",
				name: "newAdminRole",
				type: "bytes32",
			},
		],
		name: "RoleAdminChanged",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "bytes32",
				name: "role",
				type: "bytes32",
			},
			{
				indexed: true,
				internalType: "address",
				name: "account",
				type: "address",
			},
			{
				indexed: true,
				internalType: "address",
				name: "sender",
				type: "address",
			},
		],
		name: "RoleGranted",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "bytes32",
				name: "role",
				type: "bytes32",
			},
			{
				indexed: true,
				internalType: "address",
				name: "account",
				type: "address",
			},
			{
				indexed: true,
				internalType: "address",
				name: "sender",
				type: "address",
			},
		],
		name: "RoleRevoked",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "address",
				name: "quote",
				type: "address",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "index",
				type: "uint256",
			},
		],
		name: "TemplateAdded",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "address",
				name: "creator",
				type: "address",
			},
			{
				indexed: false,
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "requestId",
				type: "uint256",
			},
			{
				indexed: false,
				internalType: "string",
				name: "name",
				type: "string",
			},
			{
				indexed: false,
				internalType: "string",
				name: "symbol",
				type: "string",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "totalSupply",
				type: "uint256",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "launchTime",
				type: "uint256",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "launchFee",
				type: "uint256",
			},
		],
		name: "TokenCreate",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				indexed: false,
				internalType: "address",
				name: "account",
				type: "address",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "price",
				type: "uint256",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "amount",
				type: "uint256",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "cost",
				type: "uint256",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "fee",
				type: "uint256",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "offers",
				type: "uint256",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "funds",
				type: "uint256",
			},
		],
		name: "TokenPurchase",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "uint256",
				name: "origin",
				type: "uint256",
			},
		],
		name: "TokenPurchase2",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				indexed: false,
				internalType: "address",
				name: "account",
				type: "address",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "price",
				type: "uint256",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "amount",
				type: "uint256",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "cost",
				type: "uint256",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "fee",
				type: "uint256",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "offers",
				type: "uint256",
			},
			{
				indexed: false,
				internalType: "uint256",
				name: "funds",
				type: "uint256",
			},
		],
		name: "TokenSale",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "uint256",
				name: "origin",
				type: "uint256",
			},
		],
		name: "TokenSale2",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: "address",
				name: "token",
				type: "address",
			},
		],
		name: "TradeStop",
		type: "event",
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: "address",
				name: "implementation",
				type: "address",
			},
		],
		name: "Upgraded",
		type: "event",
	},
	{
		inputs: [],
		name: "DEFAULT_ADMIN_ROLE",
		outputs: [
			{
				internalType: "bytes32",
				name: "",
				type: "bytes32",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "ROLE_DEPLOYER",
		outputs: [
			{
				internalType: "bytes32",
				name: "",
				type: "bytes32",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "ROLE_OPERATOR",
		outputs: [
			{
				internalType: "bytes32",
				name: "",
				type: "bytes32",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "STATUS_ADDING_LIQUIDITY",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "STATUS_COMPLETED",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "STATUS_HALT",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "STATUS_TRADING",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "TRADING_FEES",
		outputs: [
			{
				internalType: "address",
				name: "",
				type: "address",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "",
				type: "address",
			},
		],
		name: "_feeCollectors",
		outputs: [
			{
				internalType: "bool",
				name: "",
				type: "bool",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "_feeRecipient",
		outputs: [
			{
				internalType: "address",
				name: "",
				type: "address",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "_launchFee",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "_referralRewardKeeper",
		outputs: [
			{
				internalType: "address",
				name: "",
				type: "address",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "_referralRewardRate",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "_templateCount",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256",
			},
		],
		name: "_templates",
		outputs: [
			{
				internalType: "address",
				name: "quote",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "initialLiquidity",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "maxRaising",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "totalSupply",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "maxOffers",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "minTradingFee",
				type: "uint256",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "_tokenCount",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "_tokenCreator",
		outputs: [
			{
				internalType: "address",
				name: "",
				type: "address",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "",
				type: "address",
			},
		],
		name: "_tokenInfoEx1s",
		outputs: [
			{
				internalType: "uint256",
				name: "launchFee",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "pcFee",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "feeSetting",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "blockNumber",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "extraFee",
				type: "uint256",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "",
				type: "address",
			},
		],
		name: "_tokenInfoExs",
		outputs: [
			{
				internalType: "address",
				name: "creator",
				type: "address",
			},
			{
				internalType: "address",
				name: "founder",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "reserves",
				type: "uint256",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "",
				type: "address",
			},
		],
		name: "_tokenInfos",
		outputs: [
			{
				internalType: "address",
				name: "base",
				type: "address",
			},
			{
				internalType: "address",
				name: "quote",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "template",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "totalSupply",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "maxOffers",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "maxRaising",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "launchTime",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "offers",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "funds",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "lastPrice",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "K",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "T",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "status",
				type: "uint256",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256",
			},
		],
		name: "_tokens",
		outputs: [
			{
				internalType: "address",
				name: "",
				type: "address",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "_tradingFeeRate",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "_tradingHalt",
		outputs: [
			{
				internalType: "bool",
				name: "",
				type: "bool",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "tokenAddress",
				type: "address",
			},
		],
		name: "addLiquidity",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "bytes",
				name: "args",
				type: "bytes",
			},
			{
				internalType: "uint256",
				name: "time",
				type: "uint256",
			},
			{
				internalType: "bytes",
				name: "signature",
				type: "bytes",
			},
		],
		name: "buyToken",
		outputs: [],
		stateMutability: "payable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "origin",
				type: "uint256",
			},
			{
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "maxFunds",
				type: "uint256",
			},
		],
		name: "buyToken",
		outputs: [],
		stateMutability: "payable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				internalType: "address",
				name: "to",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "maxFunds",
				type: "uint256",
			},
		],
		name: "buyToken",
		outputs: [],
		stateMutability: "payable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "origin",
				type: "uint256",
			},
			{
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				internalType: "address",
				name: "to",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "maxFunds",
				type: "uint256",
			},
		],
		name: "buyToken",
		outputs: [],
		stateMutability: "payable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "maxFunds",
				type: "uint256",
			},
		],
		name: "buyToken",
		outputs: [],
		stateMutability: "payable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "origin",
				type: "uint256",
			},
			{
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				internalType: "address",
				name: "to",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "funds",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "minAmount",
				type: "uint256",
			},
		],
		name: "buyTokenAMAP",
		outputs: [],
		stateMutability: "payable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				internalType: "address",
				name: "to",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "funds",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "minAmount",
				type: "uint256",
			},
		],
		name: "buyTokenAMAP",
		outputs: [],
		stateMutability: "payable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "funds",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "minAmount",
				type: "uint256",
			},
		],
		name: "buyTokenAMAP",
		outputs: [],
		stateMutability: "payable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "origin",
				type: "uint256",
			},
			{
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "funds",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "minAmount",
				type: "uint256",
			},
		],
		name: "buyTokenAMAP",
		outputs: [],
		stateMutability: "payable",
		type: "function",
	},
	{
		inputs: [
			{
				components: [
					{
						internalType: "address",
						name: "base",
						type: "address",
					},
					{
						internalType: "address",
						name: "quote",
						type: "address",
					},
					{
						internalType: "uint256",
						name: "template",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "totalSupply",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "maxOffers",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "maxRaising",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "launchTime",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "offers",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "funds",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "lastPrice",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "K",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "T",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "status",
						type: "uint256",
					},
				],
				internalType: "struct TokenManager3.TokenInfo",
				name: "ti",
				type: "tuple",
			},
			{
				internalType: "uint256",
				name: "funds",
				type: "uint256",
			},
		],
		name: "calcBuyAmount",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256",
			},
		],
		stateMutability: "pure",
		type: "function",
	},
	{
		inputs: [
			{
				components: [
					{
						internalType: "address",
						name: "base",
						type: "address",
					},
					{
						internalType: "address",
						name: "quote",
						type: "address",
					},
					{
						internalType: "uint256",
						name: "template",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "totalSupply",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "maxOffers",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "maxRaising",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "launchTime",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "offers",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "funds",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "lastPrice",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "K",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "T",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "status",
						type: "uint256",
					},
				],
				internalType: "struct TokenManager3.TokenInfo",
				name: "ti",
				type: "tuple",
			},
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256",
			},
		],
		name: "calcBuyCost",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256",
			},
		],
		stateMutability: "pure",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "maxRaising",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "totalSupply",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "offers",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "reserves",
				type: "uint256",
			},
		],
		name: "calcInitialPrice",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256",
			},
		],
		stateMutability: "pure",
		type: "function",
	},
	{
		inputs: [
			{
				components: [
					{
						internalType: "address",
						name: "base",
						type: "address",
					},
					{
						internalType: "address",
						name: "quote",
						type: "address",
					},
					{
						internalType: "uint256",
						name: "template",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "totalSupply",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "maxOffers",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "maxRaising",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "launchTime",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "offers",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "funds",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "lastPrice",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "K",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "T",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "status",
						type: "uint256",
					},
				],
				internalType: "struct TokenManager3.TokenInfo",
				name: "ti",
				type: "tuple",
			},
		],
		name: "calcLastPrice",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256",
			},
		],
		stateMutability: "pure",
		type: "function",
	},
	{
		inputs: [
			{
				components: [
					{
						internalType: "address",
						name: "base",
						type: "address",
					},
					{
						internalType: "address",
						name: "quote",
						type: "address",
					},
					{
						internalType: "uint256",
						name: "template",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "totalSupply",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "maxOffers",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "maxRaising",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "launchTime",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "offers",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "funds",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "lastPrice",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "K",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "T",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "status",
						type: "uint256",
					},
				],
				internalType: "struct TokenManager3.TokenInfo",
				name: "ti",
				type: "tuple",
			},
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256",
			},
		],
		name: "calcSellCost",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256",
			},
		],
		stateMutability: "pure",
		type: "function",
	},
	{
		inputs: [
			{
				components: [
					{
						internalType: "address",
						name: "base",
						type: "address",
					},
					{
						internalType: "address",
						name: "quote",
						type: "address",
					},
					{
						internalType: "uint256",
						name: "template",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "totalSupply",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "maxOffers",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "maxRaising",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "launchTime",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "offers",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "funds",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "lastPrice",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "K",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "T",
						type: "uint256",
					},
					{
						internalType: "uint256",
						name: "status",
						type: "uint256",
					},
				],
				internalType: "struct TokenManager3.TokenInfo",
				name: "ti",
				type: "tuple",
			},
			{
				internalType: "uint256",
				name: "funds",
				type: "uint256",
			},
		],
		name: "calcTradingFee",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "lockId",
				type: "uint256",
			},
			{
				internalType: "address",
				name: "recipient",
				type: "address",
			},
			{
				internalType: "uint128",
				name: "amount0Max",
				type: "uint128",
			},
			{
				internalType: "uint128",
				name: "amount1Max",
				type: "uint128",
			},
		],
		name: "collectFees",
		outputs: [
			{
				internalType: "uint256",
				name: "amount0",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "amount1",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "fee0",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "fee1",
				type: "uint256",
			},
		],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "bytes",
				name: "args",
				type: "bytes",
			},
			{
				internalType: "bytes",
				name: "signature",
				type: "bytes",
			},
		],
		name: "createToken",
		outputs: [],
		stateMutability: "payable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "bytes32",
				name: "role",
				type: "bytes32",
			},
		],
		name: "getRoleAdmin",
		outputs: [
			{
				internalType: "bytes32",
				name: "",
				type: "bytes32",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "account",
				type: "address",
			},
		],
		name: "grantDeployer",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "account",
				type: "address",
			},
		],
		name: "grantOperator",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "bytes32",
				name: "role",
				type: "bytes32",
			},
			{
				internalType: "address",
				name: "account",
				type: "address",
			},
		],
		name: "grantRole",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "bytes32",
				name: "role",
				type: "bytes32",
			},
			{
				internalType: "address",
				name: "account",
				type: "address",
			},
		],
		name: "hasRole",
		outputs: [
			{
				internalType: "bool",
				name: "",
				type: "bool",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "initialize",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "signer",
				type: "address",
			},
			{
				internalType: "address",
				name: "feeRecipient",
				type: "address",
			},
			{
				internalType: "address",
				name: "tokenCreator",
				type: "address",
			},
			{
				internalType: "address",
				name: "referralRewardKeeper",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "launchFee",
				type: "uint256",
			},
		],
		name: "initialize",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "bytes32",
				name: "role",
				type: "bytes32",
			},
		],
		name: "nameOfRole",
		outputs: [
			{
				internalType: "string",
				name: "",
				type: "string",
			},
		],
		stateMutability: "pure",
		type: "function",
	},
	{
		inputs: [],
		name: "owner",
		outputs: [
			{
				internalType: "address",
				name: "",
				type: "address",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "proxiableUUID",
		outputs: [
			{
				internalType: "bytes32",
				name: "",
				type: "bytes32",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "renounceOwnership",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "bytes32",
				name: "role",
				type: "bytes32",
			},
			{
				internalType: "address",
				name: "account",
				type: "address",
			},
		],
		name: "renounceRole",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "account",
				type: "address",
			},
		],
		name: "revokeDeployer",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "account",
				type: "address",
			},
		],
		name: "revokeOperator",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "bytes32",
				name: "role",
				type: "bytes32",
			},
			{
				internalType: "address",
				name: "account",
				type: "address",
			},
		],
		name: "revokeRole",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "origin",
				type: "uint256",
			},
			{
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "minFunds",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "feeRate",
				type: "uint256",
			},
			{
				internalType: "address",
				name: "feeRecipient",
				type: "address",
			},
		],
		name: "sellToken",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "origin",
				type: "uint256",
			},
			{
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "minFunds",
				type: "uint256",
			},
		],
		name: "sellToken",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "origin",
				type: "uint256",
			},
			{
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256",
			},
		],
		name: "sellToken",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "minFunds",
				type: "uint256",
			},
		],
		name: "sellToken",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "origin",
				type: "uint256",
			},
			{
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				internalType: "address",
				name: "from",
				type: "address",
			},
			{
				internalType: "address",
				name: "to",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "minFunds",
				type: "uint256",
			},
		],
		name: "sellToken",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "uint256",
				name: "origin",
				type: "uint256",
			},
			{
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				internalType: "address",
				name: "from",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "minFunds",
				type: "uint256",
			},
			{
				internalType: "uint256",
				name: "feeRate",
				type: "uint256",
			},
			{
				internalType: "address",
				name: "feeRecipient",
				type: "address",
			},
		],
		name: "sellToken",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256",
			},
		],
		name: "sellToken",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "bytes32",
				name: "role",
				type: "bytes32",
			},
			{
				internalType: "bytes32",
				name: "adminRole",
				type: "bytes32",
			},
		],
		name: "setRoleAdmin",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "newSigner",
				type: "address",
			},
		],
		name: "setSigner",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [],
		name: "signer",
		outputs: [
			{
				internalType: "address",
				name: "",
				type: "address",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "bytes4",
				name: "interfaceId",
				type: "bytes4",
			},
		],
		name: "supportsInterface",
		outputs: [
			{
				internalType: "bool",
				name: "",
				type: "bool",
			},
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				internalType: "bool",
				name: "value",
				type: "bool",
			},
		],
		name: "suspendTrading",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "newOwner",
				type: "address",
			},
		],
		name: "transferOwnership",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "newImplementation",
				type: "address",
			},
		],
		name: "upgradeTo",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "newImplementation",
				type: "address",
			},
			{
				internalType: "bytes",
				name: "data",
				type: "bytes",
			},
		],
		name: "upgradeToAndCall",
		outputs: [],
		stateMutability: "payable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "token",
				type: "address",
			},
			{
				internalType: "address",
				name: "to",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256",
			},
		],
		name: "withdrawERC20",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
	{
		inputs: [
			{
				internalType: "address",
				name: "to",
				type: "address",
			},
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256",
			},
		],
		name: "withdrawEth",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
] as const;
