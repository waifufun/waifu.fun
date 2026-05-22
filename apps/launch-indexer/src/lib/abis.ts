/**
 * Event ABIs for the wave H launch indexer.
 *
 * Authoritative source: packages/contracts-evm/contracts/{LaunchFactory,LaunchVault,BundleRouter}.sol
 *
 * Each fragment is a minimal `parseAbi`-compatible signature. Argument names
 * here MUST match the Solidity source so that decoded `args` line up with the
 * handler types in `./events.ts`. wave I audit: these were re-synced against
 * the post-phase2b contract sources.
 */

import { parseAbi } from "viem";

export const launchFactoryEventsAbi = parseAbi([
	"event LaunchCreated(bytes32 indexed launchId, address indexed creator, address indexed predictedToken, address vault, address router, address treasuryLp, address taxSplitter, address agentSafe, uint8 tier, uint256 presaleCap, uint256 v2BuyBnb, uint256 closeTimestamp)",
]);

export const launchVaultEventsAbi = parseAbi([
	"event RouterSet(address indexed router)",
	"event Deposited(address indexed user, uint256 amount, uint256 newTotal)",
	"event Withdrawn(address indexed user, uint256 amount, uint256 penalty, uint256 refund)",
	"event Closed(address indexed by, uint256 totalDeposited, uint256 bonusPool)",
	"event LaunchExecuted(address indexed token, uint256 totalBnb, uint256 timestamp)",
	"event Distributed(address indexed token, uint256 presalerShare)",
	"event RefundEnabled(address indexed by, string reason)",
	"event Refunded(address indexed user, uint256 principal, uint256 bonus, uint256 refundAmount)",
	"event Claimed(address indexed user, uint256 amount, uint256 totalClaimed)",
]);

export const bundleRouterEventsAbi = parseAbi([
	"event BundleExecuted(address indexed token, address indexed pool, uint256 quoteAmt, uint256 v2BuyBnb, uint256 tokensReceived, uint256 tokensBurned, uint256 tokensToTreasury, uint256 tokensToVault, uint256 tipPaid, uint256 openMcBnb)",
	"event BundleFailed(string reason)",
]);

export const portalEventsAbi = parseAbi([
	"event TokenCreated(uint256 ts, address creator, uint256 nonce, address token, string name, string symbol, string meta)",
]);

export const flapEventsAbi = parseAbi([
	"event LaunchedToDEX(address indexed token, address indexed pair, uint256 quoteAmt)",
]);

export const allLaunchEventAbis = [
	...launchFactoryEventsAbi,
	...launchVaultEventsAbi,
	...bundleRouterEventsAbi,
	...portalEventsAbi,
	...flapEventsAbi,
];
