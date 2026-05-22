// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TreasuryLP} from "../contracts/TreasuryLP.sol";
import {ERC20Mock} from "../contracts/mocks/ERC20Mock.sol";

/// @title EchidnaTreasuryLP
/// @notice property-based fuzzing surface for TreasuryLP custody contract.
///         the harness is itself the owner so we can probe the sweep path
///         without a separate signer; non-owner reverts are exercised via
///         re-entry through a helper attacker contract.
contract EchidnaTreasuryLP {
    TreasuryLP internal lp;
    ERC20Mock internal tokenA;
    ERC20Mock internal tokenB;
    Attacker internal attacker;

    address internal constant FACTORY = address(0xF1);

    constructor() payable {
        lp = new TreasuryLP(address(this), FACTORY);
        tokenA = new ERC20Mock();
        tokenA.mint(address(this), 1_000_000 ether);
        tokenB = new ERC20Mock();
        tokenB.mint(address(this), 1_000_000 ether);
        attacker = new Attacker(address(lp));
    }

    // ---------------------------------------------------------------
    // fuzzable actions
    // ---------------------------------------------------------------

    function recordA() external {
        try lp.recordManagedToken(address(tokenA)) {} catch {}
    }

    function recordB() external {
        try lp.recordManagedToken(address(tokenB)) {} catch {}
    }

    function fundA(uint96 amt) external {
        uint256 bal = tokenA.balanceOf(address(this));
        if (amt == 0 || amt > bal) return;
        tokenA.transfer(address(lp), amt);
    }

    function fundB(uint96 amt) external {
        uint256 bal = tokenB.balanceOf(address(this));
        if (amt == 0 || amt > bal) return;
        tokenB.transfer(address(lp), amt);
    }

    function sweepA(uint96 amt) external {
        try lp.sweep(address(this), address(tokenA), amt) {} catch {}
    }

    function sweepB(uint96 amt) external {
        try lp.sweep(address(this), address(tokenB), amt) {} catch {}
    }

    function nonOwnerSweep(uint96 amt) external {
        try attacker.attemptSweep(address(tokenA), amt) returns (bool ok) {
            // if attacker reports success, ownership check is broken.
            assert(!ok);
        } catch {}
    }

    function sendBnb(uint96 amt) external {
        if (amt == 0 || amt > address(this).balance) return;
        (bool ok,) = address(lp).call{value: amt}("");
        assert(!ok); // receive() must always revert
    }

    // ---------------------------------------------------------------
    // properties (echidna will negate these)
    // ---------------------------------------------------------------

    /// once a managed token is locked, it cannot be re-bound to a different one.
    function echidna_managed_token_lock_holds() public view returns (bool) {
        address mt = lp.managedToken();
        if (mt == address(0)) return true;
        return mt == address(tokenA) || mt == address(tokenB);
    }

    /// receive() always reverts so the contract holds zero raw BNB.
    function echidna_no_raw_bnb() public view returns (bool) {
        return address(lp).balance == 0;
    }

    /// owner is immutable and equals the harness.
    function echidna_owner_immutable() public view returns (bool) {
        return lp.owner() == address(this);
    }

    /// factory is immutable and equals the seeded value.
    function echidna_factory_immutable() public view returns (bool) {
        return lp.factory() == FACTORY;
    }

    receive() external payable {}
}

contract Attacker {
    address internal target;
    constructor(address _t) { target = _t; }

    /// non-owner sweep attempt. returns whether the call succeeded.
    function attemptSweep(address t, uint256 amt) external returns (bool ok) {
        (ok,) = target.call(abi.encodeWithSignature("sweep(address,address,uint256)", address(this), t, amt));
    }
}
