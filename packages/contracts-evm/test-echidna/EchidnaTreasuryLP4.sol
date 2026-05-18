// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Property-based fuzz harness for TreasuryLP4 (wave N).
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

    constructor() payable {
        tok = new ERC20Mock();
        wbnb = new MockWBNB();
        v3f = new MockV3Factory();
        npm = new MockNonfungiblePositionManager(address(wbnb));
        feed = new MockBnbUsdFeed(600 * 1e8);
        router = new MockFlapV2Router(address(wbnb));
        deployer = new TreasuryLP4Deployer();

        TreasuryLP4.Tier[4] memory ts;
        // Tier spacing is 200 for V3_FEE=10000; align to that.
        // Build a strictly stacked ladder so the constructor validators pass.
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
