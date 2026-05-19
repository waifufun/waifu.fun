// SPDX-License-Identifier: MIT
//
//   ╭┈┈┈ waifu.fun ┈┈┈╮
//   │   TreasuryLP4    │
//   │   tier-4 vault   │
//   │   PCS V3 NPM     │
//   ╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯
//
//   Wave N rewire:
//     - real PCS V3 NonfungiblePositionManager mint() for single-sided ranges
//     - 4-way claim split: buyback 10% / platform 5% / patron 20% / agent 65%
//     - vendored TickMath for pool init sqrtPriceX96 at tier 0 lower tick
//     - one-shot setFlapV2Pair(): pair is unknown at factory.createLaunch
//       time (graduates post-bundle); factory.finalizeLaunch wires it in
//       once PCS V2 factory.getPair(token, WBNB) is non-zero
//
pragma solidity ^0.8.24;

// slither-disable-start calls-loop,cyclomatic-complexity,incorrect-equality,low-level-calls,reentrancy-balance,reentrancy-no-eth,timestamp,unused-return

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    IChainlinkFeed,
    IFlapV2Pair,
    IFlapV2Router,
    INonfungiblePositionManager,
    IV3Factory,
    IWETH
} from "./interfaces/ITreasuryLPDeps.sol";
import {ITreasuryLPRegistry} from "./interfaces/ITreasuryLPRegistry.sol";
import {TickMath} from "./libraries/TickMath.sol";

contract TreasuryLP4 is Ownable, ReentrancyGuard, ITreasuryLPRegistry {
    using SafeERC20 for IERC20;

    uint256 public constant TWAP_WINDOW = 1800;
    uint16 public constant BUYBACK_BPS_MAX = 1500;
    uint32 public constant EPOCH_LENGTH_MIN = 3600;
    uint32 public constant EPOCH_LENGTH_MAX = 86400;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 private constant Q112 = 2 ** 112;
    uint256 private constant BPS_DENOMINATOR = 10000;
    uint256 private constant ORACLE_STALE_AFTER = 1 hours;
    uint256 private constant TIER_COUNT = 4;
    uint256 private constant TREASURY_ALLOCATION = 100_000_000 ether;
    int24 internal constant MAX_TICK_PCS_V3_1PCT = 887200;

    IERC20 public immutable token;
    IFlapV2Router public immutable flapV2Router;
    address public immutable wbnb;
    INonfungiblePositionManager public immutable npm;
    IV3Factory public immutable v3Factory;
    address public immutable agentSafe;
    address public immutable platformReceiver;
    address public immutable patronReceiver;
    IChainlinkFeed public immutable bnbUsdFeed;
    uint24 public immutable v3Fee;
    int24 public immutable v3TickSpacing;
    bool public immutable tokenIsToken0;

    /// @notice Settable-once V2 pair, written by `setFlapV2Pair` after FLAP
    ///         graduates the launch. Until set, oracle pokes / tier advances
    ///         revert with `pair_not_set`.
    IFlapV2Pair public flapV2Pair;
    bool public tokenIsPair0;
    /// @notice The PCS V3 pool address. Lazy-initialized inside deployTier(0).
    address public v3Pool;

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

    uint16 public buybackBps;
    uint16 public immutable platformBps;
    uint16 public immutable patronBps;
    uint32 public epochLength = 14400;

    event OraclePoked(uint256 price0CumulativeLast, uint32 blockTimestampLast);
    event TierEpochAdvanced(uint8 indexed tierIdx, uint8 newEpochsAbove, uint256 currentMcUSD);
    event TierEpochsReset(uint8 indexed tierIdx, uint8 prevEpochsAbove, uint256 currentMcUSD);
    event TierDeployed(uint8 indexed tierIdx, uint256 indexed positionId, uint128 liquidity, uint256 tokenAmount);
    event TierPaused(uint8 indexed tierIdx, address indexed by);
    event V3PoolInitialized(address indexed pool, uint160 sqrtPriceX96, int24 tickAtInit);
    event BuybackExecuted(uint256 bnbSpent, uint256 tokensBurned);
    event BnbClaimed(
        address indexed agentSafe,
        uint256 bnbToAgent,
        uint256 bnbBuyback,
        uint256 bnbPlatform,
        uint256 bnbPatron
    );
    event TokenFeesClaimed(address indexed agentSafe, uint256 tokenAmount);
    event BuybackBpsSet(uint16 oldBps, uint16 newBps);
    event EpochLengthSet(uint32 oldSecs, uint32 newSecs);
    event FlapV2PairSet(address indexed pair, bool tokenIsPair0);

    error zero_address();
    error bad_pair();
    error bad_decimals();
    error bad_feed_decimals();
    error bad_tier();
    error bad_epoch_length();
    error bad_buyback_bps();
    error bad_bps_sum();
    error bad_fee_tier();
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
    error pair_not_set();
    error pair_already_set();
    error pool_tick_misaligned();

    struct ConstructorArgs {
        address token;
        address flapV2Router;
        address wbnb;
        address v3Npm;
        address v3Factory;
        address agentSafe;
        address platformReceiver;
        address patronReceiver;
        address bnbUsdFeed;
        uint16 buybackBps;
        uint16 platformBps;
        uint16 patronBps;
        uint24 v3Fee;
        Tier[4] tiers;
    }

    constructor(ConstructorArgs memory args) {
        if (
            args.token == address(0) || args.flapV2Router == address(0) || args.wbnb == address(0)
                || args.v3Npm == address(0) || args.v3Factory == address(0) || args.agentSafe == address(0)
                || args.platformReceiver == address(0) || args.patronReceiver == address(0)
                || args.bnbUsdFeed == address(0)
        ) revert zero_address();
        // Token decimals are not read at construction because the token may
        // not yet have bytecode (predicted CREATE2 address). All FLAP tokens are
        // 18 decimals by construction (TaxedTokenV3 hardcodes 18).
        if (IChainlinkFeed(args.bnbUsdFeed).decimals() != 8) revert bad_feed_decimals();
        if (args.buybackBps > BUYBACK_BPS_MAX) revert bad_buyback_bps();
        if (uint256(args.buybackBps) + uint256(args.platformBps) + uint256(args.patronBps) >= BPS_DENOMINATOR) {
            revert bad_bps_sum();
        }

        int24 spacing = IV3Factory(args.v3Factory).feeAmountTickSpacing(args.v3Fee);
        if (spacing == 0) revert bad_fee_tier();

        token = IERC20(args.token);
        flapV2Router = IFlapV2Router(args.flapV2Router);
        wbnb = args.wbnb;
        npm = INonfungiblePositionManager(args.v3Npm);
        v3Factory = IV3Factory(args.v3Factory);
        agentSafe = args.agentSafe;
        platformReceiver = args.platformReceiver;
        patronReceiver = args.patronReceiver;
        bnbUsdFeed = IChainlinkFeed(args.bnbUsdFeed);
        v3Fee = args.v3Fee;
        v3TickSpacing = spacing;
        tokenIsToken0 = args.token < args.wbnb;
        buybackBps = args.buybackBps;
        platformBps = args.platformBps;
        patronBps = args.patronBps;

        uint256 totalTierTokens = 0;
        for (uint256 i = 0; i < TIER_COUNT; i++) {
            _validateTier(args.tiers[i], spacing);
            tiers[i] = args.tiers[i];
            totalTierTokens += args.tiers[i].tokenAmount;
        }
        if (totalTierTokens > TREASURY_ALLOCATION) revert bad_tier();
    }

    receive() external payable {}

    // ---------------------------------------------------------------------
    // ITreasuryLPRegistry shim
    // ---------------------------------------------------------------------

    /// @notice Called by BundleRouter after seeding TreasuryLP4 with the 100M
    ///         treasury allocation. TreasuryLP4 already knows its token via
    ///         constructor immutable, so this is a sanity check + no-op.
    function recordManagedToken(address t) external view {
        if (t != address(token)) revert bad_pair();
    }

    // ---------------------------------------------------------------------
    // pair init (one-shot, owner-only)
    // ---------------------------------------------------------------------

    /// @notice Wire the FLAP V2 pair once graduation has created it.
    ///         Validates token0 / token1 against (token, wbnb), bootstraps the
    ///         TWAP oracle snapshot, and sets tier 0's epoch start clock.
    /// @dev    Owner is the LaunchFactory (or its finalizer) until ownership
    ///         is handed off to the agent Safe inside the same transaction.
    function setFlapV2Pair(address pair_) external onlyOwner {
        if (address(flapV2Pair) != address(0)) revert pair_already_set();
        if (pair_ == address(0)) revert zero_address();

        address pairToken0 = IFlapV2Pair(pair_).token0();
        address pairToken1 = IFlapV2Pair(pair_).token1();
        address tokenAddr = address(token);
        address wbnbAddr = wbnb;
        bool isPairToken0 = pairToken0 == tokenAddr && pairToken1 == wbnbAddr;
        bool isPairToken1 = pairToken1 == tokenAddr && pairToken0 == wbnbAddr;
        if (!isPairToken0 && !isPairToken1) revert bad_pair();

        // Now that the token contract exists, verify its decimals match the
        // 18-decimal market-cap math used by _mcUSDFrom.
        if (IERC20Metadata(tokenAddr).decimals() != 18) revert bad_decimals();

        flapV2Pair = IFlapV2Pair(pair_);
        tokenIsPair0 = isPairToken0;
        emit FlapV2PairSet(pair_, isPairToken0);

        // Bootstrap the TWAP oracle and start tier 0's epoch clock.
        _oraclePokeInternal();
        tiers[0].lastEpochTimestamp = uint32(block.timestamp);
    }

    // ---------------------------------------------------------------------
    // oracle / tier advance
    // ---------------------------------------------------------------------

    function oraclePoke() public {
        if (address(flapV2Pair) == address(0)) revert pair_not_set();
        _oraclePokeInternal();
    }

    function _oraclePokeInternal() internal {
        uint32 timestampNow = uint32(block.timestamp);
        OracleSnapshot memory snapshot = oracleSnapshot;
        uint32 elapsed = timestampNow - snapshot.blockTimestampLast;
        if (snapshot.blockTimestampLast != 0) {
            if (elapsed < TWAP_WINDOW) revert twap_not_ready();
            lastMcUSD = _mcUSDFrom(snapshot, elapsed);
            lastMcTimestamp = timestampNow;
        }

        uint256 price0CumulativeLast = _currentTokenPriceCumulative();
        oracleSnapshot = OracleSnapshot({price0CumulativeLast: price0CumulativeLast, blockTimestampLast: timestampNow});
        emit OraclePoked(price0CumulativeLast, timestampNow);
    }

    function currentMcUSD() public view returns (uint256) {
        if (address(flapV2Pair) == address(0)) revert pair_not_set();
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
        if (address(flapV2Pair) == address(0)) revert pair_not_set();
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

    // ---------------------------------------------------------------------
    // claim: 4-way split (buyback / platform / patron / agent)
    // ---------------------------------------------------------------------

    function claim() external nonReentrant {
        if (msg.sender != agentSafe) revert only_agent_safe();
        if (nextTierIndex == 0) revert no_tiers_deployed();

        uint256 balanceBefore = address(this).balance;
        uint256 tokenBalanceBefore = token.balanceOf(address(this));

        // 1. Sweep accrued amounts out of every deployed tier into this contract.
        //    NPM transfers WBNB (not native), so we unwrap below.
        for (uint256 i = 0; i < nextTierIndex; i++) {
            if (tiers[i].deployed) {
                npm.collect(
                    INonfungiblePositionManager.CollectParams({
                        tokenId: tiers[i].positionId,
                        recipient: address(this),
                        amount0Max: type(uint128).max,
                        amount1Max: type(uint128).max
                    })
                );
            }
        }

        // 2. Unwrap any WBNB received.
        uint256 wbnbBalance = IERC20(wbnb).balanceOf(address(this));
        if (wbnbBalance > 0) {
            IWETH(wbnb).withdraw(wbnbBalance);
        }

        uint256 collected = address(this).balance - balanceBefore;
        uint256 tokenCollected = token.balanceOf(address(this)) - tokenBalanceBefore;
        if (collected == 0 && tokenCollected == 0) revert nothing_to_claim();

        // 3. Forward token-side fees (when price re-enters our range from above) to safe.
        if (tokenCollected > 0) {
            token.safeTransfer(agentSafe, tokenCollected);
            emit TokenFeesClaimed(agentSafe, tokenCollected);
        }

        // 4. 4-way BNB split. Agent gets the remainder so rounding dust stays with the safe.
        uint256 buybackBnb = (collected * buybackBps) / BPS_DENOMINATOR;
        uint256 platformBnb = (collected * platformBps) / BPS_DENOMINATOR;
        uint256 patronBnb = (collected * patronBps) / BPS_DENOMINATOR;
        uint256 agentBnb = collected - buybackBnb - platformBnb - patronBnb;

        // 5. Buyback (V2 swap to DEAD). Accepts ~5% slippage; FLAP tax still applies.
        uint256 tokensBurned;
        if (buybackBnb > 0) {
            uint256 tokensBefore = token.balanceOf(DEAD);
            address[] memory path = new address[](2);
            path[0] = wbnb;
            path[1] = address(token);
            uint256[] memory amounts = flapV2Router.getAmountsOut(buybackBnb, path);
            uint256 amountOutMin = (amounts[amounts.length - 1] * 95) / 100;
            flapV2Router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: buybackBnb}(
                amountOutMin, path, DEAD, block.timestamp + 60
            );
            tokensBurned = token.balanceOf(DEAD) - tokensBefore;
            emit BuybackExecuted(buybackBnb, tokensBurned);
        }

        // 6. Forward platform / patron / agent slices.
        if (platformBnb > 0) _sendBnb(platformReceiver, platformBnb);
        if (patronBnb > 0) _sendBnb(patronReceiver, patronBnb);
        if (agentBnb > 0) _sendBnb(agentSafe, agentBnb);

        emit BnbClaimed(agentSafe, agentBnb, buybackBnb, platformBnb, patronBnb);
    }

    function _sendBnb(address to, uint256 amount) internal {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert bnb_transfer_failed();
    }

    // ---------------------------------------------------------------------
    // views
    // ---------------------------------------------------------------------

    /// @notice Per-tier BNB owed (approximate). Pulled from NPM.positions
    ///         tokensOwed{0,1}, which reflects realized fees only (does not
    ///         project unrealized BNB sitting in-range). For a precise figure
    ///         use staticCall of collect against a forked node.
    function claimable() external view returns (uint256 totalBnb, uint256[4] memory perTierBnb) {
        for (uint256 i = 0; i < nextTierIndex; i++) {
            if (tiers[i].deployed) {
                (,,,,,,, , , , uint128 owed0, uint128 owed1) = npm.positions(tiers[i].positionId);
                uint256 tierBnb = tokenIsToken0 ? uint256(owed1) : uint256(owed0);
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

    // ---------------------------------------------------------------------
    // owner admin
    // ---------------------------------------------------------------------

    function pauseTier(uint256 idx) external onlyOwner {
        if (idx >= TIER_COUNT || idx < nextTierIndex) revert bad_tier();
        if (tiers[idx].deployed) revert tier_already_deployed(idx);
        if (tiers[idx].paused) revert tier_paused(idx);
        tiers[idx].paused = true;
        emit TierPaused(uint8(idx), msg.sender);
    }

    function setBuybackBps(uint16 newBps) external onlyOwner {
        if (newBps > BUYBACK_BPS_MAX) revert bad_buyback_bps();
        if (uint256(newBps) + uint256(platformBps) + uint256(patronBps) >= BPS_DENOMINATOR) revert bad_bps_sum();
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

    // ---------------------------------------------------------------------
    // internal: tier deployment via real V3 NPM
    // ---------------------------------------------------------------------

    function deployTier(uint256 idx) internal {
        if (idx != nextTierIndex || idx >= TIER_COUNT) revert bad_tier();
        Tier storage tier = tiers[idx];
        if (tier.deployed) revert tier_already_deployed(idx);
        if (tier.paused) revert tier_paused(idx);
        if (tier.epochsAbove < tier.minEpochs) revert bad_tier();
        if (token.balanceOf(address(this)) < tier.tokenAmount) revert insufficient_tokens();

        address _wbnb = wbnb;
        address _token = address(token);
        bool isToken0 = tokenIsToken0;

        // Lazy pool init on tier 0. V3 price is always quoted as token1/token0.
        // We want the pool to start with our LP single-sided (100% token).
        //
        // PCS V3 LiquidityAmounts treats `sqrtCurrent == sqrtLower` (token0
        // case) as OOR-below the position, which IS the single-sided regime
        // we want for the mint. We anchor AT the tier-0 boundary tick so the
        // pool begins exactly at the lower edge of tier 0's range. The mint
        // succeeds with 100% token0; the pool has zero active liquidity until
        // a swap crosses INTO the tier range (which works correctly via
        // PCS V3's nextInitializedTickWithinOneWord lookup).
        //
        // Case A (token is token0): anchor at tier.tickLower (lower boundary).
        // Case B (token is token1): anchor at tier.tickUpper (upper boundary).
        //
        // Off-chain code in LaunchFactory._buildTiers is responsible for
        // producing ticks in V3's native convention so this branch holds.
        if (idx == 0) {
            // Anchor the V3 pool's initial sqrtPriceX96 AT the boundary of
            // the tier-0 single-sided position so it begins with active
            // liquidity. PCS V3 LiquidityAmounts treats `sqrtCurrent ==
            // sqrtLower` (token0 case) as OOR-below the position, which is
            // exactly the single-sided regime we want for the mint. The
            // pool stays empty until the first V3 buy crosses into the
            // tier-0 range.
            int24 anchorTick = isToken0 ? tier.tickLower : tier.tickUpper;
            uint160 initSqrtPriceX96 = TickMath.getSqrtRatioAtTick(anchorTick);
            address pool = npm.createAndInitializePoolIfNecessary(
                isToken0 ? _token : _wbnb, isToken0 ? _wbnb : _token, v3Fee, initSqrtPriceX96
            );
            v3Pool = pool;
            emit V3PoolInitialized(pool, initSqrtPriceX96, anchorTick);
        }

        // Wave O.0.2 — FLAP TaxedTokenV3 state-transition kick.
        //
        // FLAP's TaxedTokenV3 tracks all known pools (V2 pair + every V3 pool
        // the launcher pre-registered) in a `pools` mapping. In state
        // `TaxEnforcedAntiFarmer` (state == 2), transfers to ANY address in
        // `pools` are taxed (3% sell tax in our config). The NPM mint flow
        // does `transferFrom(treasury, v3Pool, amount)` to satisfy the
        // V3 pool's M0 invariant `balance0Before + amount0 <= balance0()`.
        // If that transfer is taxed, the V3 pool receives 97% of `amount0`
        // and M0 reverts.
        //
        // The state ONLY transitions from `TaxEnforcedAntiFarmer` to
        // `TaxEnforced` inside `_liquidateTax(to)` when `to == mainPool`.
        // In `TaxEnforced` state, only the mainPool (V2 pair) is taxed; V3
        // pool transfers are tax-free. None of our V2 pressure buys trigger
        // this transition because they have `to == buyer`, not
        // `to == mainPool`.
        //
        // Fix: issue a zero-amount transfer to the V2 pair (= mainPool) to
        // force `_liquidateTax(mainPool)` to fire and flip the state to
        // `TaxEnforced`. The transfer itself moves no tokens and incurs no
        // tax (amount * sellTax / 10000 = 0).
        //
        // Idempotent: in `TaxEnforced` / `TaxFree` / non-tax states the
        // liquidator either no-ops or skips the state branch entirely.
        // Reverts in `BondingCurve` state, but `deployTier` is unreachable
        // pre-graduation because `currentMcUSD` requires the pair to be
        // wired AND emitting price updates.
        address pairAddr = address(flapV2Pair);
        if (pairAddr != address(0)) {
            // SafeERC20 to tolerate non-standard return-value behaviours.
            // The recipient is mainPool; amount is 0, so no tokens move.
            token.safeTransfer(pairAddr, 0);
        }

        uint256 tokenBalanceBefore = token.balanceOf(address(this));
        token.forceApprove(address(npm), tier.tokenAmount);

        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: isToken0 ? _token : _wbnb,
            token1: isToken0 ? _wbnb : _token,
            fee: v3Fee,
            tickLower: tier.tickLower,
            tickUpper: tier.tickUpper,
            amount0Desired: isToken0 ? tier.tokenAmount : 0,
            amount1Desired: isToken0 ? 0 : tier.tokenAmount,
            // Allow 0.1% slippage: PCS V3 may round the deposited side down by
            // a few wei when converting tokenAmount into liquidity units.
            amount0Min: isToken0 ? (tier.tokenAmount * 999) / 1000 : 0,
            amount1Min: isToken0 ? 0 : (tier.tokenAmount * 999) / 1000,
            recipient: address(this),
            deadline: block.timestamp + 60
        });

        (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) = npm.mint(params);
        token.forceApprove(address(npm), 0);

        uint256 spent = isToken0 ? amount0 : amount1;
        uint256 wbnbSide = isToken0 ? amount1 : amount0;
        uint256 actualSpent = tokenBalanceBefore - token.balanceOf(address(this));

        // Single-sided guard: WBNB side must be exactly zero. The token side
        // is allowed to undershoot by V3's rounding tolerance (already capped
        // by amount{0,1}Min at 99.9%) but MUST NEVER overshoot the budgeted
        // tier.tokenAmount, and the actual balance delta MUST match what the
        // NPM reports as spent (catches FoT and any lying mock).
        if (tokenId == 0 || liquidity == 0 || wbnbSide != 0 || spent > tier.tokenAmount || actualSpent != spent) {
            revert bad_tier();
        }

        tier.positionId = tokenId;
        tier.deployed = true;
        nextTierIndex = uint8(idx + 1);
        if (idx + 1 < TIER_COUNT && tiers[idx + 1].lastEpochTimestamp == 0) {
            tiers[idx + 1].lastEpochTimestamp = uint32(block.timestamp);
        }

        emit TierDeployed(uint8(idx), tokenId, liquidity, spent);
    }

    // ---------------------------------------------------------------------
    // internal: oracle math (unchanged)
    // ---------------------------------------------------------------------

    function _currentTokenPriceCumulative() internal view returns (uint256 priceCumulative) {
        IFlapV2Pair pair = flapV2Pair;
        bool isPair0 = tokenIsPair0;
        priceCumulative = isPair0 ? pair.price0CumulativeLast() : pair.price1CumulativeLast();
        (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) = pair.getReserves();
        if (reserve0 == 0 || reserve1 == 0) revert bad_pair();
        uint32 timeElapsed = uint32(block.timestamp) - blockTimestampLast;
        if (timeElapsed > 0) {
            priceCumulative += isPair0
                ? (uint256(reserve1) * Q112 * timeElapsed) / reserve0
                : (uint256(reserve0) * Q112 * timeElapsed) / reserve1;
        }
    }

    function _mcUSDFrom(OracleSnapshot memory snapshot, uint32 elapsed) internal view returns (uint256) {
        uint256 cumulativeNow = _currentTokenPriceCumulative();
        uint256 cumulativeDelta = cumulativeNow - snapshot.price0CumulativeLast;
        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            bnbUsdFeed.latestRoundData();
        if (
            roundId == 0 || answeredInRound < roundId || answer <= 0 || startedAt > updatedAt
                || updatedAt + ORACLE_STALE_AFTER < block.timestamp
        ) {
            revert stale_bnb_usd();
        }

        uint256 liveSupply = token.totalSupply();
        return (cumulativeDelta * liveSupply * uint256(answer)) / (uint256(elapsed) * Q112 * 1e18);
    }

    function _validateTier(Tier memory tier, int24 spacing) internal pure {
        if (tier.targetMcUSD == 0 || tier.tokenAmount == 0 || tier.minEpochs == 0) revert bad_tier();
        if (tier.tickLower >= tier.tickUpper) revert bad_tier();
        if (tier.tickUpper > MAX_TICK_PCS_V3_1PCT) revert bad_tier();
        if (tier.tickLower % spacing != 0 || tier.tickUpper % spacing != 0) revert bad_tier();
        if (
            tier.epochsAbove != 0 || tier.lastEpochTimestamp != 0 || tier.deployed || tier.paused
                || tier.positionId != 0
        ) {
            revert bad_tier();
        }
    }
}

// slither-disable-end calls-loop,cyclomatic-complexity,incorrect-equality,low-level-calls,reentrancy-balance,reentrancy-no-eth,timestamp,unused-return
