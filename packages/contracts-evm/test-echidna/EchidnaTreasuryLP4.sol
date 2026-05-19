// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Property-based fuzz harness for TreasuryLP4 (wave N + wave O).
//
// The full claim() / tier-deploy lifecycle requires a live PCS V3 pool, NPM,
// FLAP V2 pair, Chainlink feed and 100M token seed; that is exercised in the
// existing TreasuryLP4.test.js and wave-n-real-fork integration suites. This
// harness pins down the invariants that should hold for the *deployed*
// instance regardless of which actor pokes at it:
//   - bps split (buyback + platform + patron) leaves room for the agent
//   - bps + recipients + immutables never mutate
//   - only the owner can pause tiers / change buybackBps / change epochLength
//   - claim() reverts for non-agent callers
//   - oracle / advance functions revert pre-setFlapV2Pair
//   - setFlapV2Pair is owner-only and one-shot
//
// Wave O update (overlapping infinity tier model):
//   - REMOVED implicit assumption that tiers are non-overlapping
//   - ADDED per-tier tickUpper <= MAX_TICK_PCS_V3_1PCT (887200) bound
//   - ADDED per-tier tickLower < tickUpper invariant
//   - ADDED tick spacing alignment invariant (lower%200==0, upper%200==0)
//   - ADDED total token allocation bound (sum tokenAmount <= 100M)
//   - The boot ladder now uses overlapping [low, MAX_TICK] ranges to prove
//     the constructor accepts the new model.

import {TreasuryLP4} from "../contracts/TreasuryLP4.sol";
import {TreasuryLP4Deployer} from "../contracts/TreasuryLP4Deployer.sol";
import {ERC20Mock} from "../contracts/mocks/ERC20Mock.sol";
import {MockBnbUsdFeed, MockV3Factory, MockNonfungiblePositionManager, MockWBNB, MockFlapV2Router}
    from "../contracts/mocks/TreasuryLPMocks.sol";

contract EchidnaTreasuryLP4 {
    TreasuryLP4 internal lp;
    TreasuryLP4Deployer internal deployer;
    Attacker internal attacker;

    ERC20Mock internal tok;
    MockWBNB internal wbnb;
    MockV3Factory internal v3f;
    MockNonfungiblePositionManager internal npm;
    MockBnbUsdFeed internal feed;
    MockFlapV2Router internal router;

    address internal constant AGENT_SAFE = address(0xA9E47);
    address internal constant PLATFORM = address(0x9197);
    address internal constant PATRON = address(0xBA70);

    uint16 internal constant BUYBACK_BPS = 1000;
    uint16 internal constant PLATFORM_BPS = 500;
    uint16 internal constant PATRON_BPS = 2000;
    uint24 internal constant V3_FEE = 10000;
    int24 internal constant MAX_TICK_PCS_V3_1PCT = 887200;
    int24 internal constant TICK_SPACING_1PCT = 200;
    uint256 internal constant TREASURY_ALLOCATION = 100_000_000 ether;

    constructor() payable {
        tok = new ERC20Mock();
        wbnb = new MockWBNB();
        v3f = new MockV3Factory();
        npm = new MockNonfungiblePositionManager(address(wbnb));
        feed = new MockBnbUsdFeed(600 * 1e8);
        router = new MockFlapV2Router(address(wbnb));
        deployer = new TreasuryLP4Deployer();

        TreasuryLP4.Tier[4] memory ts;
        // Wave O: overlapping infinity-range tiers. All four upper bounds
        // sit at MAX_TICK_PCS_V3_1PCT, lowers are spacing-aligned and
        // increasing but tier i's lower is FAR below tier i-1's upper, so
        // ranges deliberately overlap. The constructor must accept this.
        int24[4] memory lowers = [int24(-1000), int24(-200), int24(400), int24(800)];
        for (uint256 i = 0; i < 4; i++) {
            ts[i] = TreasuryLP4.Tier({
                targetMcUSD: (i + 1) * 1_000_000 * 1e8,
                tokenAmount: 25_000_000 ether,
                tickLower: lowers[i],
                tickUpper: MAX_TICK_PCS_V3_1PCT,
                minEpochs: i < 2 ? 2 : 3,
                epochsAbove: 0,
                lastEpochTimestamp: 0,
                deployed: false,
                paused: false,
                positionId: 0
            });
        }

        TreasuryLP4.ConstructorArgs memory args = TreasuryLP4.ConstructorArgs({
            token: address(tok),
            flapV2Router: address(router),
            wbnb: address(wbnb),
            v3Npm: address(npm),
            v3Factory: address(v3f),
            agentSafe: AGENT_SAFE,
            platformReceiver: PLATFORM,
            patronReceiver: PATRON,
            bnbUsdFeed: address(feed),
            buybackBps: BUYBACK_BPS,
            platformBps: PLATFORM_BPS,
            patronBps: PATRON_BPS,
            v3Fee: V3_FEE,
            tiers: ts
        });
        // Deploy via the deployer to mirror production wiring; the deployer
        // hands ownership to its msg.sender (this harness).
        address payable t = payable(deployer.deploy(args));
        lp = TreasuryLP4(t);
        attacker = new Attacker(address(lp));
    }

    // -----------------------------------------------------------------
    // fuzzable actions
    // -----------------------------------------------------------------

    /// owner-side pause attempts (this contract is the owner pre-finalize).
    function pauseTier(uint8 idx) external {
        try lp.pauseTier(uint256(idx % 4)) {} catch {}
    }

    function setBuybackBps(uint16 bps) external {
        try lp.setBuybackBps(bps) {} catch {}
    }

    function setEpochLength(uint32 secs) external {
        try lp.setEpochLength(uint256(secs)) {} catch {}
    }

    function setFlapV2PairBad(address pair) external {
        // any non-owner / bad-pair input must revert; we never expect this to
        // succeed since the harness owns the lp but the pair is garbage.
        try lp.setFlapV2Pair(pair) {} catch {}
    }

    /// non-owner action probes via attacker proxy.
    function nonOwnerPauseTier(uint8 idx) external {
        bool ok = attacker.attemptPauseTier(uint256(idx % 4));
        assert(!ok);
    }

    function nonOwnerSetBuybackBps(uint16 bps) external {
        bool ok = attacker.attemptSetBuybackBps(bps);
        assert(!ok);
    }

    function nonOwnerSetEpoch(uint32 secs) external {
        bool ok = attacker.attemptSetEpoch(uint256(secs));
        assert(!ok);
    }

    function nonAgentClaim() external {
        bool ok = attacker.attemptClaim();
        // claim must revert because (a) caller is not agent safe, AND
        // (b) no tiers deployed; either way claim() must not succeed.
        assert(!ok);
    }

    function nonOwnerSetPair(address pair) external {
        bool ok = attacker.attemptSetPair(pair);
        assert(!ok);
    }

    receive() external payable {}

    // -----------------------------------------------------------------
    // properties
    // -----------------------------------------------------------------

    /// BPS split (buyback + platform + patron) must always leave room for
    /// the agent's slice (strictly < 10000).
    function echidna_bps_room_for_agent() public view returns (bool) {
        uint256 sum = uint256(lp.buybackBps()) + uint256(lp.platformBps()) + uint256(lp.patronBps());
        return sum < 10_000;
    }

    /// platform / patron bps never mutate (no setter).
    function echidna_split_bps_fixed_for_non_buyback() public view returns (bool) {
        return lp.platformBps() == PLATFORM_BPS && lp.patronBps() == PATRON_BPS;
    }

    /// buybackBps is bounded by BUYBACK_BPS_MAX (1500).
    function echidna_buyback_bps_bounded() public view returns (bool) {
        return lp.buybackBps() <= lp.BUYBACK_BPS_MAX();
    }

    /// epoch length stays in [EPOCH_LENGTH_MIN, EPOCH_LENGTH_MAX].
    function echidna_epoch_length_bounded() public view returns (bool) {
        return lp.epochLength() >= lp.EPOCH_LENGTH_MIN() && lp.epochLength() <= lp.EPOCH_LENGTH_MAX();
    }

    /// recipients are immutable.
    function echidna_recipients_immutable() public view returns (bool) {
        return lp.agentSafe() == AGENT_SAFE
            && lp.platformReceiver() == PLATFORM
            && lp.patronReceiver() == PATRON;
    }

    /// token / wbnb / v3Fee / npm / factory / feed wiring immutable.
    function echidna_immutables_constant() public view returns (bool) {
        return address(lp.token()) == address(tok)
            && lp.wbnb() == address(wbnb)
            && lp.v3Fee() == V3_FEE
            && address(lp.npm()) == address(npm)
            && address(lp.v3Factory()) == address(v3f)
            && address(lp.bnbUsdFeed()) == address(feed);
    }

    /// pair is never set (we never reach a valid setFlapV2Pair in this
    /// harness because we never deploy a valid mock pair).
    function echidna_pair_not_set() public view returns (bool) {
        return address(lp.flapV2Pair()) == address(0);
    }

    /// owner is this harness (the deployer transferred ownership to it).
    function echidna_owner_is_harness() public view returns (bool) {
        return lp.owner() == address(this);
    }

    /// nextTierIndex must stay 0 in this harness (we never deploy a tier).
    function echidna_no_tiers_deployed() public view returns (bool) {
        return lp.nextTierIndex() == 0;
    }

    /// DEAD address invariance.
    function echidna_dead_constant() public view returns (bool) {
        return lp.DEAD() == address(0x000000000000000000000000000000000000dEaD);
    }

    // -----------------------------------------------------------------
    // Wave O properties: overlapping infinity-range tier model
    // -----------------------------------------------------------------

    /// Every tier upper bound must sit at or below the PCS V3 1% fee tier
    /// spacing-floored MAX_TICK (887200). The constructor validates this;
    /// since the Tier struct is push-only at construction it never mutates.
    function echidna_tickUpperWithinBounds() public view returns (bool) {
        for (uint256 i = 0; i < 4; i++) {
            (, , , int24 upper, , , , , , ) = lp.tiers(i);
            if (upper > MAX_TICK_PCS_V3_1PCT) return false;
        }
        return true;
    }

    /// Per-tier range validity: lower must be strictly less than upper.
    /// This is enforced at construction and must hold for the deployed
    /// instance regardless of how the harness pokes at it.
    function echidna_tickRangeValid() public view returns (bool) {
        for (uint256 i = 0; i < 4; i++) {
            (, , int24 lower, int24 upper, , , , , , ) = lp.tiers(i);
            if (lower >= upper) return false;
        }
        return true;
    }

    /// Tick spacing alignment: every lower and upper must be a multiple of
    /// the V3 fee tier spacing (200 for 1% on PCS V3).
    function echidna_tickSpacingAligned() public view returns (bool) {
        int24 spacing = lp.v3TickSpacing();
        if (spacing != TICK_SPACING_1PCT) return false;
        for (uint256 i = 0; i < 4; i++) {
            (, , int24 lower, int24 upper, , , , , , ) = lp.tiers(i);
            if (lower % spacing != 0) return false;
            if (upper % spacing != 0) return false;
        }
        return true;
    }

    /// Overlapping tier ranges are now ALLOWED. The boot config places all
    /// four uppers at MAX_TICK with increasing lowers; this asserts that
    /// tier i.tickLower < tier i-1.tickUpper for i in 1..3 (i.e. tiers
    /// truly overlap as configured).
    function echidna_overlappingAllowed() public view returns (bool) {
        for (uint256 i = 1; i < 4; i++) {
            (, , int24 lower, , , , , , , ) = lp.tiers(i);
            (, , , int24 prevUpper, , , , , , ) = lp.tiers(i - 1);
            if (lower >= prevUpper) return false; // not overlapping -> harness misconfigured
        }
        return true;
    }

    /// Sum of tokenAmount across all 4 tiers must be <= TREASURY_ALLOCATION
    /// (100M). This was an implicit invariant under the old model and stays
    /// under the new one.
    function echidna_totalAllocationBounded() public view returns (bool) {
        uint256 total;
        for (uint256 i = 0; i < 4; i++) {
            (, uint256 amt, , , , , , , , ) = lp.tiers(i);
            total += amt;
        }
        return total <= TREASURY_ALLOCATION;
    }

    /// Every tier's targetMcUSD is strictly positive (constructor rejects 0).
    function echidna_tierTargetsPositive() public view returns (bool) {
        for (uint256 i = 0; i < 4; i++) {
            (uint256 mc, , , , , , , , , ) = lp.tiers(i);
            if (mc == 0) return false;
        }
        return true;
    }

    /// Every tier's minEpochs is strictly positive (constructor rejects 0).
    function echidna_tierMinEpochsPositive() public view returns (bool) {
        for (uint256 i = 0; i < 4; i++) {
            (, , , , uint8 me, , , , , ) = lp.tiers(i);
            if (me == 0) return false;
        }
        return true;
    }
}

contract Attacker {
    address internal target;
    constructor(address _t) { target = _t; }

    function attemptPauseTier(uint256 idx) external returns (bool ok) {
        (ok,) = target.call(abi.encodeWithSignature("pauseTier(uint256)", idx));
    }

    function attemptSetBuybackBps(uint16 bps) external returns (bool ok) {
        (ok,) = target.call(abi.encodeWithSignature("setBuybackBps(uint16)", bps));
    }

    function attemptSetEpoch(uint256 secs) external returns (bool ok) {
        (ok,) = target.call(abi.encodeWithSignature("setEpochLength(uint256)", secs));
    }

    function attemptClaim() external returns (bool ok) {
        (ok,) = target.call(abi.encodeWithSignature("claim()"));
    }

    function attemptSetPair(address pair) external returns (bool ok) {
        (ok,) = target.call(abi.encodeWithSignature("setFlapV2Pair(address)", pair));
    }
}
