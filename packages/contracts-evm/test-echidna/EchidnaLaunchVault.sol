// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LaunchVault} from "../contracts/LaunchVault.sol";
import {ERC20Mock} from "../contracts/mocks/ERC20Mock.sol";

/// @title HarnessOwner
/// @notice exposes an owner() so LaunchVault.adminEnableRefund's call to
///         ILaunchFactoryOwner(factory).owner() resolves cleanly.
contract HarnessOwner {
    address public owner;
    constructor(address _owner) { owner = _owner; }
}

/// @title Actor
/// @notice cheap signer proxy. echidna multi-actor world.
contract Actor {
    function deposit(address payable vault, uint256 amount) external payable returns (bool ok) {
        (ok,) = vault.call{value: amount}(abi.encodeWithSignature("deposit()"));
    }
    function withdraw(address payable vault, uint256 amount) external returns (bool ok) {
        (ok,) = vault.call(abi.encodeWithSignature("withdraw(uint256)", amount));
    }
    function withdrawAll(address payable vault) external returns (bool ok) {
        (ok,) = vault.call(abi.encodeWithSignature("withdrawAll()"));
    }
    function refund(address payable vault) external returns (bool ok) {
        (ok,) = vault.call(abi.encodeWithSignature("refund()"));
    }
    function claim(address payable vault) external returns (bool ok) {
        (ok,) = vault.call(abi.encodeWithSignature("claim()"));
    }
    receive() external payable {}
}

/// @title EchidnaLaunchVault
/// @notice property surface for LaunchVault. harness plays factory + router +
///         bundleBot + factory-owner. three Actors play the depositor population.
contract EchidnaLaunchVault {
    LaunchVault internal vault;
    Actor internal a1;
    Actor internal a2;
    Actor internal a3;
    ERC20Mock internal token;

    uint256 internal constant PRESALE_CAP = 32 ether;
    uint256 internal constant QUOTE_AMT = 20 ether;
    uint256 internal constant V2_BUY = 12 ether;
    uint256 internal constant PENALTY_BPS = 500; // 5%
    uint256 internal constant CLOSE_DELAY = 7 days;

    uint256 internal launchedAt;

    constructor() payable {
        vault = new LaunchVault(
            address(this), // factory == harness (so harness can setRouter + serve as factory-owner)
            address(this), // creator
            address(this), // bundleBot
            PRESALE_CAP,
            QUOTE_AMT,
            V2_BUY,
            block.timestamp + CLOSE_DELAY,
            PENALTY_BPS,
            true // vesting enabled
        );
        vault.setRouter(payable(address(this)));

        a1 = new Actor();
        a2 = new Actor();
        a3 = new Actor();

        // fund actors so deposit can ride 0 - 16 BNB
        payable(address(a1)).transfer(40 ether);
        payable(address(a2)).transfer(40 ether);
        payable(address(a3)).transfer(40 ether);

        // pre-mint a token the harness will use as the launch token in distribute()
        token = new ERC20Mock();
        token.mint(address(this), 800_000_000 ether);
    }

    // -----------------------------------------------------------------
    // fuzzable actions (depositors)
    // -----------------------------------------------------------------

    function depositA1(uint96 amount) external {
        a1.deposit(payable(address(vault)), _bound(amount));
    }
    function depositA2(uint96 amount) external {
        a2.deposit(payable(address(vault)), _bound(amount));
    }
    function depositA3(uint96 amount) external {
        a3.deposit(payable(address(vault)), _bound(amount));
    }

    function withdrawA1(uint96 amount) external {
        a1.withdraw(payable(address(vault)), amount);
    }
    function withdrawA2(uint96 amount) external {
        a2.withdraw(payable(address(vault)), amount);
    }
    function withdrawA3(uint96 amount) external {
        a3.withdraw(payable(address(vault)), amount);
    }

    function withdrawAllA1() external { a1.withdrawAll(payable(address(vault))); }
    function withdrawAllA2() external { a2.withdrawAll(payable(address(vault))); }
    function withdrawAllA3() external { a3.withdrawAll(payable(address(vault))); }

    function refundA1() external { a1.refund(payable(address(vault))); }
    function refundA2() external { a2.refund(payable(address(vault))); }
    function refundA3() external { a3.refund(payable(address(vault))); }

    function claimA1() external { a1.claim(payable(address(vault))); }
    function claimA2() external { a2.claim(payable(address(vault))); }
    function claimA3() external { a3.claim(payable(address(vault))); }

    // -----------------------------------------------------------------
    // fuzzable actions (lifecycle)
    // -----------------------------------------------------------------

    function close() external {
        try vault.close() {} catch {}
    }

    function pullAndDistribute() external {
        if (vault.state() != LaunchVault.State.OPEN && vault.state() != LaunchVault.State.CLOSED) return;
        uint256 toPull = address(vault).balance;
        if (toPull == 0) return;
        try vault.pullBnbForLaunch(toPull) {
            launchedAt = block.timestamp;
            uint256 presalerShare = 320_000_000 ether; // 40% of 800M
            token.transfer(address(vault), presalerShare);
            try vault.distribute(address(token), presalerShare) {} catch {}
        } catch {}
    }

    function enableRefundUnderSubscribed() external {
        try vault.enableRefundUnderSubscribed() {} catch {}
    }

    function enableRefundBundleFailed() external {
        try vault.enableRefundBundleFailed() {} catch {}
    }

    function adminEnableRefundCall() external {
        try vault.adminEnableRefund("test") {} catch {}
    }

    // -----------------------------------------------------------------
    // properties (echidna negates these)
    // -----------------------------------------------------------------

    /// vault BNB balance accounting per state. OPEN/CLOSED: bal == td + bp.
    /// LAUNCHED: bal == 0 (router pulled all). REFUND: bal == td + bp (drains as users refund).
    function echidna_bnb_conservation() public view returns (bool) {
        LaunchVault.State s = vault.state();
        uint256 bal = address(vault).balance;
        uint256 td = vault.totalDeposited();
        uint256 bp = vault.bonusPool();
        if (s == LaunchVault.State.OPEN || s == LaunchVault.State.CLOSED) {
            return bal == td + bp;
        }
        if (s == LaunchVault.State.LAUNCHED) {
            return bal == 0;
        }
        if (s == LaunchVault.State.REFUND) {
            return bal == td + bp;
        }
        return true;
    }

    /// state enum well-formed (defensive sanity).
    function echidna_state_wellformed() public view returns (bool) {
        return uint256(vault.state()) <= 3;
    }

    /// distributed flag is one-shot: once true, token + presalerTokenBalance set.
    function echidna_distribute_once() public view returns (bool) {
        if (!vault.distributed()) return true;
        return vault.token() != address(0) && vault.presalerTokenBalance() > 0;
    }

    /// totalDeposited never exceeds presaleCap.
    function echidna_cap_respected() public view returns (bool) {
        return vault.totalDeposited() <= PRESALE_CAP;
    }

    /// vested(user) <= allocation(user) at all times.
    function echidna_vesting_bounded() public view returns (bool) {
        return _vestedLEQAlloc(address(a1)) && _vestedLEQAlloc(address(a2)) && _vestedLEQAlloc(address(a3));
    }

    /// claimed[user] <= vested(user) at all times (no over-claim).
    function echidna_no_overclaim() public view returns (bool) {
        return _claimedLEQVested(address(a1)) && _claimedLEQVested(address(a2)) && _claimedLEQVested(address(a3));
    }

    /// sum of allocations never exceeds presalerTokenBalance.
    function echidna_alloc_sum_bounded() public view returns (bool) {
        if (!vault.distributed()) return true;
        uint256 sum = vault.allocationOf(address(a1)) + vault.allocationOf(address(a2)) + vault.allocationOf(address(a3));
        return sum <= vault.presalerTokenBalance();
    }

    /// router setter is one-shot.
    function echidna_router_immutable() public view returns (bool) {
        return vault.router() == payable(address(this));
    }

    /// once LAUNCHED, totalDepositedAtLaunch is a non-zero snapshot.
    function echidna_launch_snapshot() public view returns (bool) {
        if (vault.state() != LaunchVault.State.LAUNCHED) return true;
        return vault.totalDepositedAtLaunch() > 0;
    }

    // -----------------------------------------------------------------
    // helpers
    // -----------------------------------------------------------------

    function _bound(uint96 amount) internal pure returns (uint256) {
        return uint256(amount) % 16 ether;
    }

    function _vestedLEQAlloc(address user) internal view returns (bool) {
        return vault.vestedOf(user) <= vault.allocationOf(user);
    }

    function _claimedLEQVested(address user) internal view returns (bool) {
        (, uint256 claimed,) = vault.depositors(user);
        return claimed <= vault.vestedOf(user);
    }

    /// owner stub for adminEnableRefund path (factory.owner() lookup).
    function owner() external view returns (address) {
        return address(this);
    }

    // accept BNB pulled by router (we are the router).
    receive() external payable {}
}
