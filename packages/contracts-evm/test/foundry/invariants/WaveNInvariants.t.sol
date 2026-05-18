// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";
import {TreasuryLP4} from "../../../contracts/TreasuryLP4.sol";
import {TreasuryLP4Deployer} from "../../../contracts/TreasuryLP4Deployer.sol";
import {ERC20Mock} from "../../../contracts/mocks/ERC20Mock.sol";
import {
    MockBnbUsdFeed,
    MockV3Factory,
    MockNonfungiblePositionManager,
    MockWBNB,
    MockFlapV2Router
} from "../../../contracts/mocks/TreasuryLPMocks.sol";

// =====================================================================
// TreasuryLP4 invariant fuzzing
//
// We exercise the configuration / access-control surface without running
// the live tier-deploy + claim path (that needs a live PCS V3 pool, which
// the unit suite covers via mocks and the integration suite covers via a
// BSC mainnet fork).
// =====================================================================

contract TreasuryLP4Handler is Test {
    TreasuryLP4 public lp;

    address public constant ATTACKER = address(0xBADD);

    constructor(TreasuryLP4 lp_) {
        lp = lp_;
    }

    // owner-side actions (this handler owns the lp).
    function setBuybackBps(uint16 bps) external {
        try lp.setBuybackBps(bps) {} catch {}
    }

    function setEpochLength(uint32 secs) external {
        try lp.setEpochLength(uint256(secs)) {} catch {}
    }

    function pauseTier(uint8 idx) external {
        try lp.pauseTier(uint256(idx % 4)) {} catch {}
    }

    // non-owner attempts via low-level prank.
    function nonOwnerSetBuybackBps(uint16 bps) external {
        vm.prank(ATTACKER);
        (bool ok,) = address(lp).call(abi.encodeWithSignature("setBuybackBps(uint16)", bps));
        assertFalse(ok, "non-owner should not setBuybackBps");
    }

    function nonOwnerSetEpoch(uint32 secs) external {
        vm.prank(ATTACKER);
        (bool ok,) = address(lp).call(abi.encodeWithSignature("setEpochLength(uint256)", uint256(secs)));
        assertFalse(ok, "non-owner should not setEpochLength");
    }

    function nonOwnerPauseTier(uint8 idx) external {
        vm.prank(ATTACKER);
        (bool ok,) = address(lp).call(abi.encodeWithSignature("pauseTier(uint256)", uint256(idx % 4)));
        assertFalse(ok, "non-owner should not pauseTier");
    }

    function nonOwnerSetPair(address pair) external {
        vm.prank(ATTACKER);
        (bool ok,) = address(lp).call(abi.encodeWithSignature("setFlapV2Pair(address)", pair));
        assertFalse(ok, "non-owner should not setFlapV2Pair");
    }

    function nonAgentClaim() external {
        vm.prank(ATTACKER);
        (bool ok,) = address(lp).call(abi.encodeWithSignature("claim()"));
        assertFalse(ok, "non-agent should not claim");
    }
}

contract TreasuryLP4InvariantTest is StdInvariant, Test {
    TreasuryLP4 internal lp;
    TreasuryLP4Deployer internal deployer;
    TreasuryLP4Handler internal handler;
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

    function setUp() public {
        tok = new ERC20Mock();
        wbnb = new MockWBNB();
        v3f = new MockV3Factory();
        npm = new MockNonfungiblePositionManager(address(wbnb));
        feed = new MockBnbUsdFeed(600 * 1e8);
        router = new MockFlapV2Router(address(wbnb));
        deployer = new TreasuryLP4Deployer();

        TreasuryLP4.Tier[4] memory ts;
        int24[5] memory edges = [int24(-1000), int24(-200), int24(400), int24(800), int24(1200)];
        for (uint256 i = 0; i < 4; i++) {
            ts[i] = TreasuryLP4.Tier({
                targetMcUSD: (i + 1) * 1_000_000 * 1e8,
                tokenAmount: 25_000_000 ether,
                tickLower: edges[i],
                tickUpper: edges[i + 1],
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
        lp = TreasuryLP4(payable(deployer.deploy(args)));
        handler = new TreasuryLP4Handler(lp);
        targetContract(address(handler));
    }

    /// BPS split (buyback + platform + patron) always leaves room for
    /// the agent's slice (strictly < 10000). buybackBps mutates via the
    /// owner setter; platform/patron are immutable.
    function invariant_bps_room_for_agent() public view {
        uint256 sum = uint256(lp.buybackBps())
            + uint256(lp.platformBps())
            + uint256(lp.patronBps());
        assertLt(sum, 10_000);
    }

    /// platform / patron bps never mutate (they are now immutable).
    function invariant_split_bps_fixed() public view {
        assertEq(lp.platformBps(), PLATFORM_BPS);
        assertEq(lp.patronBps(), PATRON_BPS);
    }

    /// buybackBps is bounded by BUYBACK_BPS_MAX (1500).
    function invariant_buyback_bps_bounded() public view {
        assertLe(lp.buybackBps(), lp.BUYBACK_BPS_MAX());
    }

    /// epoch length stays within [EPOCH_LENGTH_MIN, EPOCH_LENGTH_MAX].
    function invariant_epoch_length_bounded() public view {
        assertGe(lp.epochLength(), lp.EPOCH_LENGTH_MIN());
        assertLe(lp.epochLength(), lp.EPOCH_LENGTH_MAX());
    }

    /// recipients are immutable.
    function invariant_recipients_immutable() public view {
        assertEq(lp.agentSafe(), AGENT_SAFE);
        assertEq(lp.platformReceiver(), PLATFORM);
        assertEq(lp.patronReceiver(), PATRON);
    }

    /// the pair stays unset because the handler never produces a valid pair.
    function invariant_pair_not_set() public view {
        assertEq(address(lp.flapV2Pair()), address(0));
    }

    /// owner remains this test contract (deployer's transferOwnership target).
    function invariant_owner_is_test() public view {
        assertEq(lp.owner(), address(this));
    }

    /// nextTierIndex stays 0 (no tier deployable without a valid pair).
    function invariant_no_tiers_deployed() public view {
        assertEq(lp.nextTierIndex(), 0);
    }

    /// the immutable wiring is constant for the lp's lifetime.
    function invariant_immutables_constant() public view {
        assertEq(address(lp.token()), address(tok));
        assertEq(lp.wbnb(), address(wbnb));
        assertEq(lp.v3Fee(), V3_FEE);
        assertEq(address(lp.npm()), address(npm));
        assertEq(address(lp.v3Factory()), address(v3f));
        assertEq(address(lp.bnbUsdFeed()), address(feed));
    }
}
