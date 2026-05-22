/**
 * Minimal ABI for LaunchVault contract reads + writes used by the public
 * launch round page (`/launch/[id]`).
 *
 * Source: packages/contracts-evm/contracts/LaunchVault.sol
 *
 * Only the methods + events the UI consumes. Trimmed on purpose so the
 * frontend bundle does not ship the full hardhat artifact.
 */
export const launchVaultAbi = [
	// state reads
	{
		type: "function",
		stateMutability: "view",
		name: "state",
		inputs: [],
		outputs: [{ name: "", type: "uint8" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "totalDeposited",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "bonusPool",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "depositorCount",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "closeTimestamp",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "penaltyBps",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "vestingEnabled",
		inputs: [],
		outputs: [{ name: "", type: "bool" }],
	},
	{
		// On-chain storage var is `uint256 public presalerTokenBalance` which
		// auto-generates a `presalerTokenBalance()` getter. The previous ABI
		// name `presaleTokens` did not exist on-chain and reverted every call,
		// which (with allowFailure:false in useVaultSnapshot) killed the whole
		// snapshot batch and left the launch page stuck in the `created`
		// display state — blocking the claim widget post-launch.
		type: "function",
		stateMutability: "view",
		name: "presalerTokenBalance",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "depositors",
		inputs: [{ name: "", type: "address" }],
		outputs: [
			{ name: "deposited", type: "uint256" },
			{ name: "claimed", type: "uint256" },
			{ name: "seen", type: "bool" },
		],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "allocationOf",
		inputs: [{ name: "user", type: "address" }],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "vestedOf",
		inputs: [{ name: "user", type: "address" }],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "claimableOf",
		inputs: [{ name: "user", type: "address" }],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "launchTimestamp",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "totalDepositedAtLaunch",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "token",
		inputs: [],
		outputs: [{ name: "", type: "address" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "tier",
		inputs: [],
		outputs: [{ name: "", type: "uint8" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "factory",
		inputs: [],
		outputs: [{ name: "", type: "address" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "getDepositorInfo",
		inputs: [{ name: "user", type: "address" }],
		outputs: [
			{ name: "deposited", type: "uint256" },
			{ name: "totalTokens", type: "uint256" },
			{ name: "vested", type: "uint256" },
			{ name: "claimed", type: "uint256" },
			{ name: "claimable", type: "uint256" },
		],
	},
	// writes
	{
		type: "function",
		stateMutability: "payable",
		name: "deposit",
		inputs: [],
		outputs: [],
	},
	{
		type: "function",
		stateMutability: "nonpayable",
		name: "withdraw",
		inputs: [{ name: "amount", type: "uint256" }],
		outputs: [],
	},
	{
		type: "function",
		stateMutability: "nonpayable",
		name: "withdrawAll",
		inputs: [],
		outputs: [],
	},
	{
		type: "function",
		stateMutability: "nonpayable",
		name: "claim",
		inputs: [],
		outputs: [],
	},
	{
		type: "function",
		stateMutability: "nonpayable",
		name: "refund",
		inputs: [],
		outputs: [],
	},
	{
		type: "function",
		stateMutability: "nonpayable",
		name: "enableRefundUnderSubscribed",
		inputs: [],
		outputs: [],
	},
	{
		type: "function",
		stateMutability: "nonpayable",
		name: "enableRefundBundleFailed",
		inputs: [],
		outputs: [],
	},

	// events
	{
		type: "event",
		name: "Deposited",
		inputs: [
			{ name: "user", type: "address", indexed: true },
			{ name: "amount", type: "uint256", indexed: false },
			{ name: "newTotal", type: "uint256", indexed: false },
		],
	},
	{
		type: "event",
		name: "Withdrawn",
		inputs: [
			{ name: "user", type: "address", indexed: true },
			{ name: "amount", type: "uint256", indexed: false },
			{ name: "penalty", type: "uint256", indexed: false },
			{ name: "refund", type: "uint256", indexed: false },
		],
	},
	{
		type: "event",
		name: "LaunchExecuted",
		inputs: [
			{ name: "token", type: "address", indexed: true },
			{ name: "totalBnb", type: "uint256", indexed: false },
			{ name: "timestamp", type: "uint256", indexed: false },
		],
	},
	{
		type: "event",
		name: "RefundEnabled",
		inputs: [
			{ name: "by", type: "address", indexed: true },
			{ name: "reason", type: "string", indexed: false },
		],
	},
	{
		type: "event",
		name: "Refunded",
		inputs: [
			{ name: "user", type: "address", indexed: true },
			{ name: "principal", type: "uint256", indexed: false },
			{ name: "bonus", type: "uint256", indexed: false },
			{ name: "refundAmount", type: "uint256", indexed: false },
		],
	},
	{
		type: "event",
		name: "Claimed",
		inputs: [
			{ name: "user", type: "address", indexed: true },
			{ name: "amount", type: "uint256", indexed: false },
			{ name: "totalClaimed", type: "uint256", indexed: false },
		],
	},
] as const;

/**
 * State enum mirror of `LaunchVault.State`.
 * On-chain ordering: OPEN=0, CLOSED=1, LAUNCHED=2, REFUND=3.
 *
 * REFUND is entered via `enableRefundUnderSubscribed` (anyone, post-close,
 * under-subscribed), `enableRefundBundleFailed` (bundle bot after a failed
 * bundle), or delayed `scheduleAdminRefund` + `adminEnableRefund` calls from
 * the factory owner.
 */
export const VaultState = {
	OPEN: 0,
	CLOSED: 1,
	LAUNCHED: 2,
	REFUND: 3,
} as const;

export type VaultStateValue = (typeof VaultState)[keyof typeof VaultState];
