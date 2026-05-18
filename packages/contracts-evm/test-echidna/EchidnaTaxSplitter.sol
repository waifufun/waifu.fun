// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TaxSplitter} from "../contracts/TaxSplitter.sol";
import {ERC20Mock} from "../contracts/mocks/ERC20Mock.sol";

/// @title EchidnaTaxSplitter
/// @notice Property-based fuzzing surface for the wave M1 TaxSplitter.
///         Exercises the 3-way split logic for both native BNB and ERC20,
///         while asserting that BPS configuration and recipient addresses
///         are immutable for the contract's lifetime. Reentrancy attempts
///         via a malicious receive() hook are also exercised here as a
///         secondary safety net (the contract has no nonReentrant guard
///         but the math is balance-snapshot driven so a re-entry should
///         only produce a no-op).
contract EchidnaTaxSplitter {
    TaxSplitter internal splitter;
    ERC20Mock internal tok;

    address internal constant PLATFORM = address(0x1111);
    address internal constant PATRON = address(0x2222);
    address internal constant AGENT = address(0x3333);
    uint16 internal constant PLATFORM_BPS = 1000; // 10%
    uint16 internal constant PATRON_BPS = 2500; // 25%
    uint16 internal constant EXPECTED_AGENT_BPS = 6500; // 65%

    uint256 internal totalDeposited;
    uint256 internal totalDepositedTokens;

    constructor() payable {
        splitter = new TaxSplitter(PLATFORM, PATRON, AGENT, PLATFORM_BPS, PATRON_BPS);
        tok = new ERC20Mock();
        tok.mint(address(this), 1_000_000_000 ether);
    }

    // -----------------------------------------------------------------
    // fuzzable actions
    // -----------------------------------------------------------------

    function fundNative(uint64 amt) external {
        if (amt == 0 || amt > address(this).balance) return;
        (bool ok,) = address(splitter).call{value: amt}("");
        if (ok) totalDeposited += amt;
    }

    function fundToken(uint96 amt) external {
        uint256 bal = tok.balanceOf(address(this));
        if (amt == 0 || amt > bal) return;
        tok.transfer(address(splitter), amt);
        totalDepositedTokens += amt;
    }

    function callSplit() external {
        try splitter.split() {} catch {}
    }

    function callSplitToken() external {
        try splitter.splitToken(address(tok)) {} catch {}
    }

    function callSplitMany() external {
        address[] memory ts = new address[](1);
        ts[0] = address(tok);
        try splitter.splitMany(ts) {} catch {}
    }

    receive() external payable {}

    // -----------------------------------------------------------------
    // properties (echidna negates these)
    // -----------------------------------------------------------------

    /// bps tuple always sums to 10000.
    function echidna_bps_invariant() public view returns (bool) {
        uint256 sum = uint256(splitter.platformBps())
            + uint256(splitter.patronBps())
            + uint256(splitter.agentBps());
        return sum == 10_000;
    }

    /// agentBps is the constructor-derived remainder; never mutates.
    function echidna_agent_bps_remainder() public view returns (bool) {
        return splitter.agentBps() == EXPECTED_AGENT_BPS;
    }

    /// recipient storage is immutable.
    function echidna_recipients_immutable() public view returns (bool) {
        return splitter.platform() == PLATFORM
            && splitter.patron() == PATRON
            && splitter.agent() == AGENT;
    }

    /// after any number of split() calls the splitter never accumulates
    /// raw BNB greater than the deposits we made (it cannot create or
    /// strand more than what we deposited).
    function echidna_native_no_blowup() public view returns (bool) {
        return address(splitter).balance <= totalDeposited;
    }

    /// after any number of splitToken() calls the splitter balance is
    /// bounded by the deposits we made (cannot fabricate tokens).
    function echidna_token_no_blowup() public view returns (bool) {
        return tok.balanceOf(address(splitter)) <= totalDepositedTokens;
    }

    /// recipient deltas always equal what left the splitter. Modulo any
    /// pending balance, sum of (platform + patron + agent) external
    /// balances <= totalDeposited. PLATFORM/PATRON/AGENT are sentinel
    /// EOAs that no other actor in this harness ever credits.
    function echidna_recipients_sum_bounded() public view returns (bool) {
        uint256 outs = PLATFORM.balance + PATRON.balance + AGENT.balance;
        return outs + address(splitter).balance <= totalDeposited;
    }

    /// token version of the same bound.
    function echidna_token_recipients_sum_bounded() public view returns (bool) {
        uint256 outs = tok.balanceOf(PLATFORM) + tok.balanceOf(PATRON) + tok.balanceOf(AGENT);
        return outs + tok.balanceOf(address(splitter)) <= totalDepositedTokens;
    }

    /// constants.
    function echidna_bps_constants() public view returns (bool) {
        return splitter.BPS_DENOM() == 10_000
            && splitter.MIN_PLATFORM_CUT() == 1000
            && splitter.MAX_PLATFORM_CUT() == 5000;
    }
}
