/**
 * Minimal ABI fragments for the W45 tier cron.
 *
 * Authoritative source: packages/contracts-evm/contracts/TreasuryLP4.sol
 *
 * We only need the two write entrypoints we actually call (`oraclePoke`,
 * `checkAndAdvance`) plus the read accessors we use to decide whether
 * advancing is worth a tx (`nextTierIndex`, `oracleSnapshot`, `tiers`,
 * `epochLength`).
 */

import { parseAbi } from "viem";

export const treasuryLp4Abi = parseAbi([
	"function oraclePoke()",
	"function checkAndAdvance()",
	"function nextTierIndex() view returns (uint8)",
	"function currentMcUSD() view returns (uint256)",
	"function epochLength() view returns (uint32)",
	"function oracleSnapshot() view returns (uint256 price0CumulativeLast, uint32 blockTimestampLast)",
	"function tiers(uint256 idx) view returns (uint256 targetMcUSD, uint256 tokenAmount, int24 tickLower, int24 tickUpper, uint8 minEpochs, uint8 epochsAbove, uint32 lastEpochTimestamp, bool deployed, bool paused, uint256 positionId)",
	"event OraclePoked(uint256 price0CumulativeLast, uint32 blockTimestampLast)",
	"event TierEpochAdvanced(uint8 indexed tierIdx, uint8 newEpochsAbove, uint256 currentMcUSD)",
	"event TierEpochsReset(uint8 indexed tierIdx, uint8 prevEpochsAbove, uint256 currentMcUSD)",
	"event TierDeployed(uint8 indexed tierIdx, uint256 indexed positionId, uint128 liquidity, uint256 tokenAmount)",
]);

export const TIER_COUNT = 4;
/** Matches `TreasuryLP4.TWAP_WINDOW` (seconds). */
export const TWAP_WINDOW_SECONDS = 1800;
