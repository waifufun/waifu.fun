// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";
import {TaxSplitter} from "../../../contracts/TaxSplitter.sol";
import {AgentSafeDeployer} from "../../../contracts/AgentSafeDeployer.sol";
import {ERC20Mock} from "../../../contracts/mocks/ERC20Mock.sol";
import {
    MockSafeSingleton,
    MockSafeProxyFactory
} from "../../../contracts/mocks/SafeMocks.sol";

interface ISafeReadback {
    function getOwners() external view returns (address[] memory);
    function getThreshold() external view returns (uint256);
}

// =====================================================================
// TaxSplitter handler + invariants
// =====================================================================

contract TaxSplitterHandler is Test {
    TaxSplitter public splitter;
    ERC20Mock public tok;

    address public constant PLATFORM = address(0xCAFE1);
    address public constant PATRON = address(0xCAFE2);
    address public constant AGENT = address(0xCAFE3);

    uint256 public totalDepositedNative;
    uint256 public totalDepositedToken;

    constructor(TaxSplitter splitter_, ERC20Mock tok_) {
        splitter = splitter_;
        tok = tok_;
    }

    function depositNative(uint96 amt) external {
        uint256 v = bound(uint256(amt), 0, 10 ether);
        vm.deal(address(this), v);
        (bool ok,) = address(splitter).call{value: v}("");
        if (ok) totalDepositedNative += v;
    }

    function depositToken(uint96 amt) external {
        uint256 v = bound(uint256(amt), 0, 1_000_000 ether);
        tok.mint(address(splitter), v);
        totalDepositedToken += v;
    }

    function split() external {
        try splitter.split() {} catch {}
    }

    function splitToken() external {
        try splitter.splitToken(address(tok)) {} catch {}
    }

    function splitMany() external {
        address[] memory ts = new address[](1);
        ts[0] = address(tok);
        try splitter.splitMany(ts) {} catch {}
    }

    receive() external payable {}
}

contract TaxSplitterInvariantTest is StdInvariant, Test {
    TaxSplitter internal splitter;
    ERC20Mock internal tok;
    TaxSplitterHandler internal handler;

    function setUp() public {
        splitter = new TaxSplitter(
            address(0xCAFE1), // platform
            address(0xCAFE2), // patron
            address(0xCAFE3), // agent
            1000, // 10%
            2500 // 25%
        );
        tok = new ERC20Mock();
        handler = new TaxSplitterHandler(splitter, tok);
        targetContract(address(handler));
    }

    /// BPS tuple never mutates.
    function invariant_bps_sum() public view {
        assertEq(
            uint256(splitter.platformBps())
                + uint256(splitter.patronBps())
                + uint256(splitter.agentBps()),
            10_000
        );
    }

    /// recipients are immutable.
    function invariant_recipients_immutable() public view {
        assertEq(splitter.platform(), address(0xCAFE1));
        assertEq(splitter.patron(), address(0xCAFE2));
        assertEq(splitter.agent(), address(0xCAFE3));
    }

    /// recipients' native balances + splitter's remaining balance
    /// never exceed what the handler deposited.
    function invariant_native_conservation() public view {
        uint256 outs = address(0xCAFE1).balance
            + address(0xCAFE2).balance
            + address(0xCAFE3).balance;
        assertLe(outs + address(splitter).balance, handler.totalDepositedNative());
    }

    /// same for the ERC20 ledger.
    function invariant_token_conservation() public view {
        uint256 outs = tok.balanceOf(address(0xCAFE1))
            + tok.balanceOf(address(0xCAFE2))
            + tok.balanceOf(address(0xCAFE3));
        assertLe(outs + tok.balanceOf(address(splitter)), handler.totalDepositedToken());
    }

    /// the splitter never accumulates more than the total deposited
    /// (no inflation, no contract self-mint path).
    function invariant_splitter_native_bounded() public view {
        assertLe(address(splitter).balance, handler.totalDepositedNative());
    }

    function invariant_splitter_token_bounded() public view {
        assertLe(tok.balanceOf(address(splitter)), handler.totalDepositedToken());
    }
}

// =====================================================================
// AgentSafeDeployer invariants
// =====================================================================

contract AgentSafeDeployerHandler is Test {
    AgentSafeDeployer public deployer;
    address public lastSafe;
    address[] public lastOwners;
    uint256 public lastThreshold;
    uint256 public lastSaltNonce;

    address internal constant A = address(0xA1);
    address internal constant B = address(0xB2);
    address internal constant C = address(0xC3);

    constructor(AgentSafeDeployer deployer_) {
        deployer = deployer_;
    }

    function deploy(uint8 shape, uint64 saltNonce) external {
        address[] memory os;
        uint256 threshold;
        if (shape % 5 == 0) {
            os = new address[](1);
            os[0] = A;
            threshold = 1;
        } else if (shape % 5 == 1) {
            os = new address[](2);
            os[0] = A;
            os[1] = B;
            threshold = 1;
        } else if (shape % 5 == 2) {
            os = new address[](2);
            os[0] = A;
            os[1] = B;
            threshold = 2;
        } else if (shape % 5 == 3) {
            os = new address[](3);
            os[0] = A;
            os[1] = B;
            os[2] = C;
            threshold = 2;
        } else {
            os = new address[](3);
            os[0] = A;
            os[1] = B;
            os[2] = C;
            threshold = 3;
        }

        address predicted = deployer.predictAgentSafe(os, threshold, uint256(saltNonce));
        try deployer.deployAgentSafe(os, threshold, uint256(saltNonce)) returns (address safe) {
            // recorded address must match prediction.
            assertEq(safe, predicted);
            lastSafe = safe;
            delete lastOwners;
            for (uint256 i = 0; i < os.length; i++) lastOwners.push(os[i]);
            lastThreshold = threshold;
            lastSaltNonce = uint256(saltNonce);
        } catch {}
    }

    function getLastOwners() external view returns (address[] memory) {
        return lastOwners;
    }
}

contract AgentSafeDeployerInvariantTest is StdInvariant, Test {
    AgentSafeDeployer internal deployer;
    MockSafeSingleton internal sing;
    MockSafeProxyFactory internal pf;
    AgentSafeDeployerHandler internal handler;

    function setUp() public {
        sing = new MockSafeSingleton();
        pf = new MockSafeProxyFactory();
        deployer = new AgentSafeDeployer(address(sing), address(pf));
        handler = new AgentSafeDeployerHandler(deployer);
        targetContract(address(handler));
    }

    /// deployed safes always reflect the last-asked owner set.
    function invariant_owners_match() public view {
        address last = handler.lastSafe();
        if (last == address(0)) return;
        address[] memory expected = handler.getLastOwners();
        address[] memory got = ISafeReadback(last).getOwners();
        assertEq(got.length, expected.length);
        for (uint256 i = 0; i < got.length; i++) {
            assertEq(got[i], expected[i]);
        }
    }

    function invariant_threshold_match() public view {
        address last = handler.lastSafe();
        if (last == address(0)) return;
        assertEq(ISafeReadback(last).getThreshold(), handler.lastThreshold());
    }

    function invariant_deployer_never_owner() public view {
        address last = handler.lastSafe();
        if (last == address(0)) return;
        address[] memory got = ISafeReadback(last).getOwners();
        for (uint256 i = 0; i < got.length; i++) {
            assertFalse(got[i] == address(deployer));
        }
    }

    function invariant_immutables_constant() public view {
        assertEq(deployer.safeSingleton(), address(sing));
        assertEq(deployer.safeProxyFactory(), address(pf));
    }
}
