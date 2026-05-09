/**
 * Event ABIs for the W44 launch indexer.
 *
 * Authoritative source: packages/contracts-evm/contracts/{LaunchFactory,LaunchVault,BundleRouter}.sol
 *
 * Each fragment is a minimal `parseAbi`-compatible signature. Argument names
 * here MUST match the Solidity source so that decoded `args` line up with the
 * handler types in `./events.ts`.
 */

import { parseAbi } from "viem";

export const launchFactoryEventsAbi = parseAbi([
	"event LaunchCreated(address indexed creator, address indexed token, address vault, address router, address taxSplitter, address treasuryReserve, uint8 tier, uint256 presaleCap, uint256 v2BuyBnb, bool vestingEnabled)",
]);

export const launchVaultEventsAbi = parseAbi([
	"event Deposited(address indexed user, uint256 amount, uint256 newTotal)",
	"event Withdrawn(address indexed user, uint256 amount, uint256 penalty, uint256 refund)",
	"event Closed(address indexed by, uint256 totalDeposited, uint256 bonusPool)",
	"event Launched(address indexed token, uint256 totalBnb, uint256 launchTimestamp)",
	"event RefundsEnabled()",
	"event Refunded(address indexed user, uint256 principal, uint256 bonus, uint256 refundAmount, uint256 newTotal)",
	"event Claimed(address indexed user, uint256 amount, uint256 totalClaimed)",
]);

export const bundleRouterEventsAbi = parseAbi([
	"event BundleExecuted(address indexed flapToken, address indexed v2Pair, uint256 curveFillBnb, uint256 v2BuyBnb, uint256 tokensFromV2, uint256 tokensBurned, uint256 tokensToTax, uint256 openMcBnb)",
]);

export const allLaunchEventAbis = [...launchFactoryEventsAbi, ...launchVaultEventsAbi, ...bundleRouterEventsAbi];
