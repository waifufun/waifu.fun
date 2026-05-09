// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IFlapV2Pair {
	function token0() external view returns (address);
	function token1() external view returns (address);
	function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
	function price0CumulativeLast() external view returns (uint256);
	function price1CumulativeLast() external view returns (uint256);
}

interface IFlapV2Router {
	function WETH() external view returns (address);
	function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);
	function swapExactETHForTokensSupportingFeeOnTransferTokens(
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external payable;
}

interface IChainlinkFeed {
	function latestRoundData()
		external
		view
		returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

interface IV4PoolManager {
	struct PoolKey {
		address currency0;
		address currency1;
		address hooks;
		address poolManager;
		uint24 fee;
		int24 tickSpacing;
	}

	struct ModifyLiquidityParams {
		int24 tickLower;
		int24 tickUpper;
		uint256 amount0Desired;
		uint256 amount1Desired;
		uint256 amount0Max;
		uint256 amount1Max;
		address recipient;
		uint256 deadline;
	}

	function modifyLiquidity(PoolKey calldata key, ModifyLiquidityParams calldata params, bytes calldata hookData)
		external
		returns (uint256 positionId, uint128 liquidity, uint256 amount0, uint256 amount1);

	function collect(uint256 positionId, address recipient) external returns (uint256 amount0, uint256 amount1);

	function claimable(uint256 positionId) external view returns (uint256 amount0, uint256 amount1);
}

contract TreasuryLP4 is Ownable, ReentrancyGuard {
	using SafeERC20 for IERC20;

	uint256 public constant TWAP_WINDOW = 1800;
	uint16 public constant BUYBACK_BPS_MAX = 1500;
	uint32 public constant EPOCH_LENGTH_MIN = 3600;
	uint32 public constant EPOCH_LENGTH_MAX = 86400;
	address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
	uint256 private constant Q112 = 2 ** 112;
	uint256 private constant BPS_DENOMINATOR = 10000;
	uint256 private constant ORACLE_STALE_AFTER = 1 hours;
	int24 private constant TICK_SPACING = 60;
	uint256 private constant TIER_COUNT = 4;
	uint256 private constant TREASURY_ALLOCATION = 100_000_000 ether;

	IERC20 public immutable token;
	IFlapV2Pair public immutable flapV2Pair;
	IFlapV2Router public immutable flapV2Router;
	IV4PoolManager public immutable v4PoolManager;
	address public immutable agentSafe;
	IChainlinkFeed public immutable bnbUsdFeed;
	uint256 public immutable tokenSupply;
	bool public immutable tokenIsPair0;
	bool public immutable tokenIsCurrency0;

	// Solidity does not support immutable structs. This pool key is assigned once
	// in the constructor and has no setter, so it is operationally immutable.
	IV4PoolManager.PoolKey public v4PoolKey;

	struct Tier {
		uint256 targetMcUSD;
		uint256 tokenAmount;
		int24 tickLower;
		int24 tickUpper;
		uint8 minEpochs;
		uint8 epochsAbove;
		uint32 lastEpochTimestamp;
		bool deployed;
		bool paused;
		uint256 positionId;
	}

	struct OracleSnapshot {
		uint256 price0CumulativeLast;
		uint32 blockTimestampLast;
	}

	Tier[4] public tiers;
	uint8 public nextTierIndex;
	OracleSnapshot public oracleSnapshot;
	uint256 public lastMcUSD;
	uint32 public lastMcTimestamp;
	uint16 public buybackBps = 700;
	uint32 public epochLength = 14400;

	event OraclePoked(uint256 price0CumulativeLast, uint32 blockTimestampLast);
	event TierEpochAdvanced(uint8 indexed tierIdx, uint8 newEpochsAbove, uint256 currentMcUSD);
	event TierEpochsReset(uint8 indexed tierIdx, uint8 prevEpochsAbove, uint256 currentMcUSD);
	event TierDeployed(uint8 indexed tierIdx, uint256 indexed positionId, uint128 liquidity, uint256 tokenAmount);
	event TierPaused(uint8 indexed tierIdx, address indexed by);
	event BuybackExecuted(uint256 bnbSpent, uint256 tokensBurned);
	event BnbClaimed(address indexed agentSafe, uint256 bnbToAgent, uint256 bnbBuyback);
	event TokenFeesClaimed(address indexed agentSafe, uint256 tokenAmount);
	event BuybackBpsSet(uint16 oldBps, uint16 newBps);
	event EpochLengthSet(uint32 oldSecs, uint32 newSecs);

	error zero_address();
	error bad_pair();
	error bad_decimals();
	error bad_tier();
	error bad_epoch_length();
	error bad_buyback_bps();
	error twap_not_ready();
	error stale_bnb_usd();
	error no_tiers_left();
	error epoch_not_ready();
	error tier_paused(uint256 idx);
	error tier_already_deployed(uint256 idx);
	error insufficient_tokens();
	error only_agent_safe();
	error no_tiers_deployed();
	error nothing_to_claim();
	error bnb_transfer_failed();

	constructor(
		address _token,
		address _flapV2Pair,
		address _flapV2Router,
		address _v4PoolManager,
		IV4PoolManager.PoolKey memory _v4PoolKey,
		address _agentSafe,
		address _bnbUsdFeed,
		Tier[4] memory _tiers
	) {
		if (
			_token == address(0) || _flapV2Pair == address(0) || _flapV2Router == address(0)
				|| _v4PoolManager == address(0) || _agentSafe == address(0) || _bnbUsdFeed == address(0)
		) revert zero_address();
		if (IERC20Metadata(_token).decimals() != 18) revert bad_decimals();

		address wbnb = IFlapV2Router(_flapV2Router).WETH();
		address pairToken0 = IFlapV2Pair(_flapV2Pair).token0();
		address pairToken1 = IFlapV2Pair(_flapV2Pair).token1();
		bool isPairToken0 = pairToken0 == _token && pairToken1 == wbnb;
		bool isPairToken1 = pairToken1 == _token && pairToken0 == wbnb;
		if (!isPairToken0 && !isPairToken1) revert bad_pair();
		if (_v4PoolKey.tickSpacing != TICK_SPACING) revert bad_tier();
		if (_v4PoolKey.poolManager != _v4PoolManager) revert bad_tier();
		if (_v4PoolKey.currency0 == _token) {
			if (_v4PoolKey.currency1 != address(0)) revert bad_tier();
		} else if (_v4PoolKey.currency1 == _token) {
			if (_v4PoolKey.currency0 != address(0)) revert bad_tier();
		} else {
			revert bad_tier();
		}

		token = IERC20(_token);
		flapV2Pair = IFlapV2Pair(_flapV2Pair);
		flapV2Router = IFlapV2Router(_flapV2Router);
		v4PoolManager = IV4PoolManager(_v4PoolManager);
		v4PoolKey = _v4PoolKey;
		agentSafe = _agentSafe;
		bnbUsdFeed = IChainlinkFeed(_bnbUsdFeed);
		tokenSupply = IERC20Metadata(_token).totalSupply();
		tokenIsPair0 = isPairToken0;
		tokenIsCurrency0 = _v4PoolKey.currency0 == _token;

		uint256 totalTierTokens;
		for (uint256 i = 0; i < TIER_COUNT; i++) {
			_validateTier(_tiers[i]);
			tiers[i] = _tiers[i];
			totalTierTokens += _tiers[i].tokenAmount;
		}
		if (totalTierTokens > TREASURY_ALLOCATION) revert bad_tier();

		oraclePoke();
		tiers[0].lastEpochTimestamp = uint32(block.timestamp);
	}

	receive() external payable {}

	function oraclePoke() public {
		(,, uint32 blockTimestampLast) = flapV2Pair.getReserves();
		blockTimestampLast;
		uint32 timestampNow = uint32(block.timestamp);
		OracleSnapshot memory snapshot = oracleSnapshot;
		uint32 elapsed = timestampNow - snapshot.blockTimestampLast;
		if (snapshot.blockTimestampLast != 0) {
			if (elapsed < TWAP_WINDOW) revert twap_not_ready();
			lastMcUSD = _mcUSDFrom(snapshot, elapsed);
			lastMcTimestamp = timestampNow;
		}

		uint256 price0CumulativeLast = _currentTokenPriceCumulative();
		oracleSnapshot = OracleSnapshot({
			price0CumulativeLast: price0CumulativeLast,
			blockTimestampLast: timestampNow
		});
		emit OraclePoked(price0CumulativeLast, timestampNow);
	}

	function currentMcUSD() public view returns (uint256) {
		OracleSnapshot memory snapshot = oracleSnapshot;
		uint32 timestampNow = uint32(block.timestamp);
		uint32 elapsed = timestampNow - snapshot.blockTimestampLast;
		if (elapsed < TWAP_WINDOW) {
			if (lastMcTimestamp != 0 && timestampNow - lastMcTimestamp <= TWAP_WINDOW) return lastMcUSD;
			revert twap_not_ready();
		}

		return _mcUSDFrom(snapshot, elapsed);
	}

	function checkAndAdvance() external nonReentrant {
		uint8 idx = nextTierIndex;
		if (idx >= TIER_COUNT) revert no_tiers_left();

		Tier storage tier = tiers[idx];
		if (tier.paused) revert tier_paused(idx);
		if (block.timestamp < uint256(tier.lastEpochTimestamp) + epochLength) revert epoch_not_ready();

		uint256 mc = currentMcUSD();
		tier.lastEpochTimestamp = uint32(block.timestamp);

		if (mc >= tier.targetMcUSD) {
			tier.epochsAbove += 1;
			emit TierEpochAdvanced(idx, tier.epochsAbove, mc);
			if (tier.epochsAbove >= tier.minEpochs) {
				deployTier(idx);
			}
		} else if (tier.epochsAbove > 0) {
			uint8 previous = tier.epochsAbove;
			tier.epochsAbove = 0;
			emit TierEpochsReset(idx, previous, mc);
		}
	}

	function claim() external nonReentrant {
		if (msg.sender != agentSafe) revert only_agent_safe();
		if (nextTierIndex == 0) revert no_tiers_deployed();

		uint256 balanceBefore = address(this).balance;
		uint256 tokenBalanceBefore = token.balanceOf(address(this));
		for (uint256 i = 0; i < nextTierIndex; i++) {
			if (tiers[i].deployed) {
				v4PoolManager.collect(tiers[i].positionId, address(this));
			}
		}

		uint256 collected = address(this).balance - balanceBefore;
		uint256 tokenCollected = token.balanceOf(address(this)) - tokenBalanceBefore;
		if (collected == 0 && tokenCollected == 0) revert nothing_to_claim();

		if (tokenCollected > 0) {
			token.safeTransfer(agentSafe, tokenCollected);
			emit TokenFeesClaimed(agentSafe, tokenCollected);
		}

		uint256 buybackBnb = (collected * buybackBps) / BPS_DENOMINATOR;
		uint256 tokensBefore = token.balanceOf(DEAD);
		if (buybackBnb > 0) {
			address[] memory path = new address[](2);
			path[0] = flapV2Router.WETH();
			path[1] = address(token);
			uint256[] memory amounts = flapV2Router.getAmountsOut(buybackBnb, path);
			uint256 amountOutMin = (amounts[amounts.length - 1] * 95) / 100;
			flapV2Router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: buybackBnb}(
				amountOutMin, path, DEAD, block.timestamp + 60
			);
		}
		uint256 tokensBurned = token.balanceOf(DEAD) - tokensBefore;

		uint256 bnbToAgent = collected - buybackBnb;
		if (bnbToAgent > 0) {
			(bool ok,) = payable(agentSafe).call{value: bnbToAgent}("");
			if (!ok) revert bnb_transfer_failed();
		}

		if (buybackBnb > 0) emit BuybackExecuted(buybackBnb, tokensBurned);
		emit BnbClaimed(agentSafe, bnbToAgent, buybackBnb);
	}

	function claimable() external view returns (uint256 totalBnb, uint256[12] memory perTierBnb) {
		for (uint256 i = 0; i < nextTierIndex; i++) {
			if (tiers[i].deployed) {
				(uint256 amount0, uint256 amount1) = v4PoolManager.claimable(tiers[i].positionId);
				uint256 tierBnb = tokenIsCurrency0 ? amount1 : amount0;
				perTierBnb[i] = tierBnb;
				totalBnb += tierBnb;
			}
		}
	}

	function tierDeployed(uint256 idx) external view returns (bool) {
		if (idx >= TIER_COUNT) revert bad_tier();
		return tiers[idx].deployed;
	}

	function epochsTowardTier(uint256 idx) external view returns (uint8 current, uint8 required) {
		if (idx >= TIER_COUNT) revert bad_tier();
		return (tiers[idx].epochsAbove, tiers[idx].minEpochs);
	}

	function pauseTier(uint256 idx) external onlyOwner {
		if (idx >= TIER_COUNT || idx < nextTierIndex) revert bad_tier();
		if (tiers[idx].deployed) revert tier_already_deployed(idx);
		if (tiers[idx].paused) revert tier_paused(idx);
		tiers[idx].paused = true;
		emit TierPaused(uint8(idx), msg.sender);
	}

	function setBuybackBps(uint16 newBps) external onlyOwner {
		if (newBps > BUYBACK_BPS_MAX) revert bad_buyback_bps();
		uint16 oldBps = buybackBps;
		buybackBps = newBps;
		emit BuybackBpsSet(oldBps, newBps);
	}

	function setEpochLength(uint256 newSecs) external onlyOwner {
		if (newSecs < EPOCH_LENGTH_MIN || newSecs > EPOCH_LENGTH_MAX) revert bad_epoch_length();
		uint32 oldSecs = epochLength;
		epochLength = uint32(newSecs);
		emit EpochLengthSet(oldSecs, uint32(newSecs));
	}

	function deployTier(uint256 idx) internal {
		if (idx != nextTierIndex || idx >= TIER_COUNT) revert bad_tier();
		Tier storage tier = tiers[idx];
		if (tier.deployed) revert tier_already_deployed(idx);
		if (tier.paused) revert tier_paused(idx);
		if (tier.epochsAbove < tier.minEpochs) revert bad_tier();
		if (token.balanceOf(address(this)) < tier.tokenAmount) revert insufficient_tokens();

		token.forceApprove(address(v4PoolManager), tier.tokenAmount);

		IV4PoolManager.ModifyLiquidityParams memory params = IV4PoolManager.ModifyLiquidityParams({
			tickLower: tier.tickLower,
			tickUpper: tier.tickUpper,
			amount0Desired: tokenIsCurrency0 ? tier.tokenAmount : 0,
			amount1Desired: tokenIsCurrency0 ? 0 : tier.tokenAmount,
			amount0Max: tokenIsCurrency0 ? (tier.tokenAmount * 1001) / 1000 : 1000,
			amount1Max: tokenIsCurrency0 ? 1000 : (tier.tokenAmount * 1001) / 1000,
			recipient: address(this),
			deadline: block.timestamp + 60
		});

		// Project-compatible V4 adapter assumption: modifyLiquidity pulls the
		// desired token amount from this contract and returns a position id. The
		// production PCS Infinity adapter can wrap Permit2 and periphery calls.
		(uint256 positionId, uint128 liquidity, uint256 amount0, uint256 amount1) =
			v4PoolManager.modifyLiquidity(v4PoolKey, params, "");
		uint256 spent = tokenIsCurrency0 ? amount0 : amount1;
		if (positionId == 0 || liquidity == 0 || spent == 0 || spent > tier.tokenAmount) revert bad_tier();

		tier.positionId = positionId;
		tier.deployed = true;
		nextTierIndex = uint8(idx + 1);
		if (idx + 1 < TIER_COUNT && tiers[idx + 1].lastEpochTimestamp == 0) {
			tiers[idx + 1].lastEpochTimestamp = uint32(block.timestamp);
		}

		emit TierDeployed(uint8(idx), positionId, liquidity, spent);
	}

	function _currentTokenPriceCumulative() internal view returns (uint256 priceCumulative) {
		priceCumulative = tokenIsPair0 ? flapV2Pair.price0CumulativeLast() : flapV2Pair.price1CumulativeLast();
		(uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) = flapV2Pair.getReserves();
		if (reserve0 == 0 || reserve1 == 0) revert bad_pair();
		uint32 timeElapsed = uint32(block.timestamp) - blockTimestampLast;
		if (timeElapsed > 0) {
			priceCumulative += tokenIsPair0
				? (uint256(reserve1) * Q112 / reserve0) * timeElapsed
				: (uint256(reserve0) * Q112 / reserve1) * timeElapsed;
		}
	}

	function _mcUSDFrom(OracleSnapshot memory snapshot, uint32 elapsed) internal view returns (uint256) {
		uint256 cumulativeNow = _currentTokenPriceCumulative();
		uint256 priceAverage = (cumulativeNow - snapshot.price0CumulativeLast) / elapsed;
		uint256 weiPerToken = (priceAverage * 1 ether) / Q112;

		(, int256 answer,, uint256 updatedAt,) = bnbUsdFeed.latestRoundData();
		if (answer <= 0 || updatedAt + ORACLE_STALE_AFTER < block.timestamp) revert stale_bnb_usd();

		return (weiPerToken * tokenSupply * uint256(answer)) / 1e36;
	}

	function _validateTier(Tier memory tier) internal pure {
		if (tier.targetMcUSD == 0 || tier.tokenAmount == 0 || tier.minEpochs == 0) revert bad_tier();
		if (tier.tickLower >= tier.tickUpper) revert bad_tier();
		if (tier.tickLower % TICK_SPACING != 0 || tier.tickUpper % TICK_SPACING != 0) revert bad_tier();
		if (tier.epochsAbove != 0 || tier.lastEpochTimestamp != 0 || tier.deployed || tier.paused || tier.positionId != 0) {
			revert bad_tier();
		}
	}
}
