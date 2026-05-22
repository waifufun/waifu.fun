// SPDX-License-Identifier: MIT
//
//   ╭┈┈┈ waifu.fun ┈┈┈╮
//   │   TreasuryLP5    │
//   │   tier-4 vault   │
//   │   v3-tick-gated  │
//   ╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯
//
//   Wave O simplification (replaces TreasuryLP4):
//     - NO Chainlink BNB/USD oracle, NO TWAP, NO MC gates, NO epochs
//     - all 4 V3 positions minted single-sided at launch in one tx, locked forever
//     - tier activation is purely price-crossing into tick range (native V3)
//     - launch sqrtPriceX96 is derived from FLAP V2 pair reserves at the moment
//       setFlapV2Pair is called; pool tick must be strictly OOR below (token0)
//       or above (token1) every tier range so the mint stays 100% single-sided
//     - claim() preserves the LP4 4-way split: 10/5/20/65 buyback/platform/patron/agent
//
pragma solidity ^0.8.24;

// slither-disable-start calls-loop,cyclomatic-complexity,incorrect-equality,low-level-calls,reentrancy-balance,reentrancy-no-eth,unused-return

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    IFlapV2Pair,
    IFlapV2Router,
    INonfungiblePositionManager,
    IV3Factory,
    IWETH
} from "./interfaces/ITreasuryLPDeps.sol";
import {ITreasuryLPRegistry} from "./interfaces/ITreasuryLPRegistry.sol";
import {TickMath} from "./libraries/TickMath.sol";

contract TreasuryLP5 is Ownable, ReentrancyGuard, ITreasuryLPRegistry {
    using SafeERC20 for IERC20;

    uint16 public constant BUYBACK_BPS_MAX = 1500;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 private constant BPS_DENOMINATOR = 10000;
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
    uint24 public immutable v3Fee;
    int24 public immutable v3TickSpacing;
    bool public immutable tokenIsToken0;

    /// @notice Settable-once V2 pair. Calling `setFlapV2Pair` also initializes
    ///         the V3 pool and mints all 4 single-sided positions in one tx.
    IFlapV2Pair public flapV2Pair;
    bool public tokenIsPair0;
    /// @notice PCS V3 pool address, set inside setFlapV2Pair.
    address public v3Pool;
    /// @notice Initial V3 tick the pool was bootstrapped at. Equals (rounded)
    ///         tick implied by V2 reserves at setFlapV2Pair time. All tier
    ///         ranges MUST be strictly OOR with respect to this tick.
    int24 public launchTick;
    bool public initialized;

    /// @notice Simplified Tier: just allocation + range + admin/state flags.
    ///         No epoch counters, no MC target, no Chainlink dependency.
    struct Tier {
        uint256 tokenAmount;
        int24 tickLower;
        int24 tickUpper;
        bool deployed;
        bool paused;
        uint256 positionId;
    }

    Tier[4] public tiers;

    uint16 public buybackBps;
    uint16 public immutable platformBps;
    uint16 public immutable patronBps;

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
    event FlapV2PairSet(address indexed pair, bool tokenIsPair0);

    error zero_address();
    error bad_pair();
    error bad_decimals();
    error bad_tier();
    error bad_buyback_bps();
    error bad_bps_sum();
    error bad_fee_tier();
    error tier_paused(uint256 idx);
    error tier_already_deployed(uint256 idx);
    error insufficient_tokens();
    error only_agent_safe();
    error not_initialized();
    error nothing_to_claim();
    error bnb_transfer_failed();
    error pair_not_set();
    error pair_already_set();
    error tier_not_oor();

    struct ConstructorArgs {
        address token;
        address flapV2Router;
        address wbnb;
        address v3Npm;
        address v3Factory;
        address agentSafe;
        address platformReceiver;
        address patronReceiver;
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
        ) revert zero_address();
        // Token decimals are validated lazily inside setFlapV2Pair because the
        // token may not have bytecode yet (predicted CREATE2 address).
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

    function recordManagedToken(address t) external view {
        if (t != address(token)) revert bad_pair();
    }

    // ---------------------------------------------------------------------
    // pair init + V3 pool init + tier minting (one-shot, owner-only)
    // ---------------------------------------------------------------------

    /// @notice Wire the FLAP V2 pair, initialize the V3 pool at the V2 launch
    ///         price, and mint all 4 tier positions single-sided in one tx.
    ///         Owner-only, idempotent (reverts on second call).
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

        // Now that the token contract exists, sanity-check its decimals.
        if (IERC20Metadata(tokenAddr).decimals() != 18) revert bad_decimals();

        flapV2Pair = IFlapV2Pair(pair_);
        tokenIsPair0 = isPairToken0;
        emit FlapV2PairSet(pair_, isPairToken0);

        _initializeAllTiers(pair_, isPairToken0);
    }

    // ---------------------------------------------------------------------
    // claim: 4-way split (buyback / platform / patron / agent)
    // ---------------------------------------------------------------------

    function claim() external nonReentrant {
        if (msg.sender != agentSafe) revert only_agent_safe();
        if (!initialized) revert not_initialized();

        uint256 balanceBefore = address(this).balance;
        uint256 tokenBalanceBefore = token.balanceOf(address(this));

        // 1. Sweep accrued amounts out of every deployed tier into this contract.
        for (uint256 i = 0; i < TIER_COUNT; i++) {
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

        // 3. Forward token-side fees (price re-entered the range from above) to safe.
        if (tokenCollected > 0) {
            token.safeTransfer(agentSafe, tokenCollected);
            emit TokenFeesClaimed(agentSafe, tokenCollected);
        }

        // 4. 4-way BNB split. Agent gets the remainder so rounding dust stays with safe.
        uint256 buybackBnb = (collected * buybackBps) / BPS_DENOMINATOR;
        uint256 platformBnb = (collected * platformBps) / BPS_DENOMINATOR;
        uint256 patronBnb = (collected * patronBps) / BPS_DENOMINATOR;
        uint256 agentBnb = collected - buybackBnb - platformBnb - patronBnb;

        // 5. Buyback to DEAD via V2 router. Accepts ~5% slippage.
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
    ///         project unrealized BNB sitting in-range).
    function claimable() external view returns (uint256 totalBnb, uint256[4] memory perTierBnb) {
        for (uint256 i = 0; i < TIER_COUNT; i++) {
            if (tiers[i].deployed) {
                (,,,,,,,,,, uint128 owed0, uint128 owed1) = npm.positions(tiers[i].positionId);
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

    // ---------------------------------------------------------------------
    // owner admin
    // ---------------------------------------------------------------------

    /// @notice Pause a tier so it skips minting at `setFlapV2Pair` time. Only
    ///         callable BEFORE initialization (which is the same tx as
    ///         pair-wiring). Once positions are minted, they are locked.
    function pauseTier(uint256 idx) external onlyOwner {
        if (idx >= TIER_COUNT) revert bad_tier();
        if (initialized) revert pair_already_set();
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

    // ---------------------------------------------------------------------
    // internal: initialize V3 pool + mint all tiers
    // ---------------------------------------------------------------------

    function _initializeAllTiers(address pair_, bool isPairToken0) internal {
        // Derive launch sqrtPriceX96 from V2 reserves. V3 price is token1/token0.
        // V2 stores (reserve0, reserve1) for (pair.token0, pair.token1) which
        // may NOT match the V3 token ordering we use (pair token ordering is
        // sorted by address, same convention V3 uses, so they DO match in our
        // case — both V2 and V3 sort tokens by address).
        (uint112 reserve0, uint112 reserve1,) = IFlapV2Pair(pair_).getReserves();
        if (reserve0 == 0 || reserve1 == 0) revert bad_pair();

        // sqrtPriceX96 = sqrt(reserve1 / reserve0) * 2^96
        //              = sqrt(reserve1 * 2^192 / reserve0)
        // We compute sqrt(reserve1 * 2^192 / reserve0) using mulDiv-style steps.
        uint160 launchSqrtPriceX96 = _computeSqrtPriceX96(uint256(reserve0), uint256(reserve1));
        int24 tickAtLaunch = TickMath.getTickAtSqrtRatio(launchSqrtPriceX96);

        // Round to nearest tick spacing. We need the rounded tick to be strictly
        // outside every tier range (below if token0, above if token1) so the
        // mint stays 100% single-sided.
        int24 spacing = v3TickSpacing;
        int24 roundedTick = _floorToSpacing(tickAtLaunch, spacing);
        uint160 anchorSqrtPriceX96 = TickMath.getSqrtRatioAtTick(roundedTick);

        bool isToken0 = tokenIsToken0;
        address _token = address(token);
        address _wbnb = wbnb;

        // Validate OOR constraint for every non-paused tier. Paused tiers are
        // skipped (kept as a dormant slot) so they don't constrain the anchor.
        for (uint256 i = 0; i < TIER_COUNT; i++) {
            Tier storage tier = tiers[i];
            if (tier.paused) continue;
            if (isToken0) {
                // token = token0, WBNB = token1. Single-sided token0 requires
                // launch tick < tickLower (strictly OOR-below).
                if (roundedTick >= tier.tickLower) revert tier_not_oor();
            } else {
                // token = token1, WBNB = token0. Single-sided token1 requires
                // launch tick >= tickUpper (strictly OOR-above).
                if (roundedTick < tier.tickUpper) revert tier_not_oor();
            }
        }

        // Lazy pool init. createAndInitializePoolIfNecessary uses the V3 token
        // ordering (token0 < token1), which matches the V2 pair's ordering.
        address pool = npm.createAndInitializePoolIfNecessary(
            isToken0 ? _token : _wbnb, isToken0 ? _wbnb : _token, v3Fee, anchorSqrtPriceX96
        );
        v3Pool = pool;
        launchTick = roundedTick;
        emit V3PoolInitialized(pool, anchorSqrtPriceX96, roundedTick);

        // FLAP TaxedTokenV3 state-transition kick (see LP4 commentary).
        // Issue a zero-amount transfer to the V2 pair to flip the token to
        // `TaxEnforced` so V3 pool transfers are tax-free during mint.
        token.safeTransfer(pair_, 0);

        // Mint all tier positions.
        for (uint256 i = 0; i < TIER_COUNT; i++) {
            Tier storage tier = tiers[i];
            if (tier.paused) continue;
            _mintTier(i, tier, isToken0, _token, _wbnb);
        }

        initialized = true;
        // Suppress unused-warning on isPairToken0 in case future refactor.
        isPairToken0;
    }

    function _mintTier(uint256 idx, Tier storage tier, bool isToken0, address _token, address _wbnb) internal {
        if (tier.deployed) revert tier_already_deployed(idx);
        if (token.balanceOf(address(this)) < tier.tokenAmount) revert insufficient_tokens();

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
            // Allow 0.1% slippage; V3 may round the deposited side down a few wei.
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

        // Single-sided guard: WBNB side must be exactly zero. Token side
        // is allowed to undershoot (capped by amount{0,1}Min at 99.9%) but
        // MUST NEVER overshoot the budgeted tier.tokenAmount, and the actual
        // balance delta MUST match what the NPM reports as spent (catches FoT
        // and any lying mock).
        if (tokenId == 0 || liquidity == 0 || wbnbSide != 0 || spent > tier.tokenAmount || actualSpent != spent) {
            revert bad_tier();
        }

        tier.positionId = tokenId;
        tier.deployed = true;
        emit TierDeployed(uint8(idx), tokenId, liquidity, spent);
    }

    // ---------------------------------------------------------------------
    // internal: math helpers
    // ---------------------------------------------------------------------

    /// @notice Floor a tick to the nearest multiple of `spacing` (towards
    ///         negative infinity). Standard Uniswap V3 convention.
    function _floorToSpacing(int24 tick, int24 spacing) internal pure returns (int24) {
        int24 compressed = tick / spacing;
        if (tick < 0 && tick % spacing != 0) {
            compressed -= 1;
        }
        return compressed * spacing;
    }

    /// @notice Compute sqrt(reserve1 / reserve0) * 2^96 as a Q64.96 number.
    ///         Uses 256-bit intermediates; safe for the BNB/token reserve
    ///         magnitudes we care about (max ~uint112).
    function _computeSqrtPriceX96(uint256 reserve0, uint256 reserve1) internal pure returns (uint160) {
        // ratioX192 = reserve1 * 2^192 / reserve0
        // sqrt(ratioX192) = sqrt(reserve1 / reserve0) * 2^96 = sqrtPriceX96
        //
        // For uint112 reserves, reserve1 * 2^192 fits in uint256 only when
        // reserve1 < 2^64 (since 2^192 * 2^64 = 2^256). For larger reserve1
        // we shift the math: ratioX192 = (reserve1 << 192) / reserve0, and
        // we avoid the overflow by computing in two halves.
        //
        // Simpler approach: compute price = reserve1 / reserve0 as a Q128.128
        // and then sqrt. We use Babylonian sqrt on the Q128.128 value, which
        // yields a Q64.64. Shift left by 32 to get Q64.96.
        //
        // For our use case (V2 pair just graduated), reserve1 and reserve0
        // are both order O(1e21) (uint112 max is ~5.2e33), so reserve1 << 128
        // fits in uint256 comfortably and we can do the simpler path:
        //   ratioQ128 = (reserve1 << 128) / reserve0   (Q128.128 if both side
        //                                              are "raw units"... no:
        //                                              this is just Q256 with
        //                                              the lower 128 bits being
        //                                              the fractional part)
        //   sqrtRatioQ64 = sqrt(ratioQ128)             (Q64.64-ish: sqrt of a
        //                                              Q.128 fixed-point value
        //                                              gives a Q.64 value)
        //   sqrtPriceX96 = sqrtRatioQ64 << 32          (Q64.96)
        require(reserve0 > 0 && reserve1 > 0, "bad_reserves");
        uint256 ratioQ128 = (reserve1 << 128) / reserve0;
        uint256 sqrtRatioQ64 = _sqrt(ratioQ128);
        uint256 sqrtPriceX96 = sqrtRatioQ64 << 32;
        require(sqrtPriceX96 <= type(uint160).max, "sqrt_overflow");
        return uint160(sqrtPriceX96);
    }

    /// @notice Integer sqrt via Babylonian method (Newton's method).
    function _sqrt(uint256 x) internal pure returns (uint256 z) {
        if (x == 0) return 0;
        z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }

    function _validateTier(Tier memory tier, int24 spacing) internal pure {
        if (tier.tokenAmount == 0) revert bad_tier();
        if (tier.tickLower >= tier.tickUpper) revert bad_tier();
        if (tier.tickUpper > MAX_TICK_PCS_V3_1PCT) revert bad_tier();
        if (tier.tickLower < -MAX_TICK_PCS_V3_1PCT) revert bad_tier();
        if (tier.tickLower % spacing != 0 || tier.tickUpper % spacing != 0) revert bad_tier();
        if (tier.deployed || tier.paused || tier.positionId != 0) {
            revert bad_tier();
        }
    }
}

// slither-disable-end calls-loop,cyclomatic-complexity,incorrect-equality,low-level-calls,reentrancy-balance,reentrancy-no-eth,unused-return
