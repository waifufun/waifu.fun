// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {WaifuWinddown, IPancakeRouter02} from "../../contracts/winddown/WaifuWinddown.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockWaifu is ERC20 {
    constructor() ERC20("Waifu", "WAIFU") {
        _mint(msg.sender, 1_000_000_000 ether);
    }
}

/// Fee-on-transfer mock: skims `feeBps` on every transfer (to test balance-delta credit).
contract FeeWaifu is ERC20 {
    uint256 public feeBps;
    constructor(uint256 _feeBps) ERC20("FeeWaifu", "FWAIFU") {
        feeBps = _feeBps;
        _mint(msg.sender, 1_000_000_000 ether);
    }
    function _transfer(address from, address to, uint256 value) internal override {
        if (feeBps > 0) {
            uint256 fee = (value * feeBps) / 10000;
            super._transfer(from, address(0xdead), fee);
            super._transfer(from, to, value - fee);
        } else {
            super._transfer(from, to, value);
        }
    }
}

contract MockRouter is IPancakeRouter02 {
    uint256 public rate;
    constructor(uint256 _rate) payable { rate = _rate; }
    function WETH() external pure returns (address) { return address(0xEEEE); }
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256
    ) external {
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        uint256 out = (amountIn * rate) / 1e18;
        require(out >= amountOutMin, "slippage");
        (bool ok, ) = payable(to).call{value: out}("");
        require(ok, "eth");
    }
    receive() external payable {}
}

contract WaifuWinddownTest is Test {
    MockWaifu waifu;
    MockRouter router;
    WaifuWinddown wd;
    address owner = address(this);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        waifu = new MockWaifu();
        router = new MockRouter{value: 200 ether}(1e9);
        wd = new WaifuWinddown(IERC20(address(waifu)), IPancakeRouter02(address(router)), 30 days);
        waifu.transfer(alice, 100 ether);
        waifu.transfer(bob, 300 ether);
    }

    function _agentSeedSellOpen() internal {
        waifu.approve(address(wd), 100_000_000 ether);
        wd.seedAgent(100_000_000 ether);
        wd.sellAgent(100_000_000 ether, 0, block.timestamp + 1);
        wd.openDeposits();
    }

    function _depositBoth() internal {
        vm.startPrank(alice);
        waifu.approve(address(wd), 100 ether);
        wd.deposit(100 ether);
        vm.stopPrank();
        vm.startPrank(bob);
        waifu.approve(address(wd), 300 ether);
        wd.deposit(300 ether);
        vm.stopPrank();
    }

    function test_fullLifecycle_potGrowsWithDeposits() public {
        _agentSeedSellOpen();
        uint256 potAfterAgent = address(wd).balance;
        assertGt(potAfterAgent, 0);
        _depositBoth();
        assertEq(wd.totalDeposited(), 400 ether);
        wd.closeDeposits();
        wd.sellRelinquished(400 ether, 0, block.timestamp + 1);
        assertGt(address(wd).balance, potAfterAgent, "pot grew");
        wd.finalize();
        uint256 pot = wd.potWei();
        uint256 aBefore = alice.balance;
        vm.prank(alice);
        wd.claim();
        assertEq(alice.balance - aBefore, pot * 100 ether / 400 ether);
    }

    function test_sellAgentDisabledAfterOpen() public {
        waifu.approve(address(wd), 100_000_000 ether);
        wd.seedAgent(100_000_000 ether);
        wd.openDeposits();
        vm.expectRevert(WaifuWinddown.DepositsAlreadyOpen.selector);
        wd.sellAgent(1 ether, 0, block.timestamp + 1);
    }

    function test_depositBeforeOpen_reverts() public {
        vm.startPrank(alice);
        waifu.approve(address(wd), 100 ether);
        vm.expectRevert(WaifuWinddown.DepositsNotOpen.selector);
        wd.deposit(100 ether);
        vm.stopPrank();
    }

    function test_depositAfterClose_reverts() public {
        _agentSeedSellOpen();
        wd.closeDeposits();
        vm.startPrank(alice);
        waifu.approve(address(wd), 100 ether);
        vm.expectRevert(WaifuWinddown.DepositsAreClosed.selector);
        wd.deposit(100 ether);
        vm.stopPrank();
    }

    function test_nonDepositor_cannotClaim() public {
        _agentSeedSellOpen();
        vm.startPrank(alice);
        waifu.approve(address(wd), 100 ether);
        wd.deposit(100 ether);
        vm.stopPrank();
        wd.closeDeposits();
        wd.finalize();
        vm.prank(bob);
        vm.expectRevert(WaifuWinddown.NothingDeposited.selector);
        wd.claim();
    }

    function test_doubleClaim_reverts() public {
        _agentSeedSellOpen();
        vm.startPrank(alice);
        waifu.approve(address(wd), 100 ether);
        wd.deposit(100 ether);
        vm.stopPrank();
        wd.closeDeposits();
        wd.finalize();
        vm.startPrank(alice);
        wd.claim();
        vm.expectRevert(WaifuWinddown.AlreadyClaimed.selector);
        wd.claim();
        vm.stopPrank();
    }

    function test_finalizeBeforeClose_reverts() public {
        _agentSeedSellOpen();
        vm.expectRevert(WaifuWinddown.DepositsNotClosed.selector);
        wd.finalize();
    }

    function test_sweep_onlyAfterWindow() public {
        _agentSeedSellOpen();
        vm.startPrank(alice);
        waifu.approve(address(wd), 100 ether);
        wd.deposit(100 ether);
        vm.stopPrank();
        wd.closeDeposits();
        wd.finalize();
        vm.expectRevert(WaifuWinddown.SweepTooEarly.selector);
        wd.sweep(owner);
        vm.warp(block.timestamp + 31 days);
        wd.sweep(owner);
    }

    // ---- HARDENING tests ----

    function test_feeOnTransferDeposit_creditsActualReceived() public {
        FeeWaifu fw = new FeeWaifu(300); // 3% fee
        MockRouter r2 = new MockRouter{value: 50 ether}(1e9);
        WaifuWinddown w2 = new WaifuWinddown(IERC20(address(fw)), IPancakeRouter02(address(r2)), 30 days);
        fw.transfer(alice, 1000 ether);
        // agent phase (owner has tokens)
        fw.approve(address(w2), 100 ether);
        w2.seedAgent(100 ether);
        w2.openDeposits();
        // alice deposits 100 -> 3% fee -> contract credits 97
        vm.startPrank(alice);
        fw.approve(address(w2), 100 ether);
        w2.deposit(100 ether);
        vm.stopPrank();
        assertEq(w2.deposited(alice), 97 ether, "credited net of fee");
        assertEq(w2.totalDeposited(), 97 ether);
    }

    function test_badDeadline_reverts() public {
        waifu.approve(address(wd), 100_000_000 ether);
        wd.seedAgent(100_000_000 ether);
        vm.warp(1000);
        vm.expectRevert(WaifuWinddown.BadDeadline.selector);
        wd.sellAgent(1 ether, 0, 999); // deadline in past
    }

    function test_pause_blocksDepositAndClaim() public {
        _agentSeedSellOpen();
        wd.pause();
        vm.startPrank(alice);
        waifu.approve(address(wd), 100 ether);
        vm.expectRevert(); // Pausable: paused
        wd.deposit(100 ether);
        vm.stopPrank();
        wd.unpause();
        vm.startPrank(alice);
        wd.deposit(100 ether);
        vm.stopPrank();
        assertEq(wd.deposited(alice), 100 ether);
    }

    function test_refundMode_returnsTokens_blocksFinalize() public {
        _agentSeedSellOpen();
        _depositBoth();
        wd.closeDeposits();
        // abandon: enable refund BEFORE selling deposits
        wd.enableRefundMode();
        // finalize now blocked
        vm.expectRevert(WaifuWinddown.RefundActive.selector);
        wd.finalize();
        // alice reclaims her 100
        uint256 aBal = waifu.balanceOf(alice);
        vm.prank(alice);
        wd.refund();
        assertEq(waifu.balanceOf(alice) - aBal, 100 ether, "tokens returned 1:1");
        assertEq(wd.deposited(alice), 0);
        assertEq(wd.totalDeposited(), 300 ether, "bob still owed");
    }

    function test_refund_withoutRefundMode_reverts() public {
        _agentSeedSellOpen();
        _depositBoth();
        vm.prank(alice);
        vm.expectRevert(WaifuWinddown.RefundNotActive.selector);
        wd.refund();
    }

    function test_sweepToZero_reverts() public {
        _agentSeedSellOpen();
        vm.startPrank(alice);
        waifu.approve(address(wd), 100 ether);
        wd.deposit(100 ether);
        vm.stopPrank();
        wd.closeDeposits();
        wd.finalize();
        vm.warp(block.timestamp + 31 days);
        vm.expectRevert(WaifuWinddown.ZeroAddress.selector);
        wd.sweep(address(0));
    }

    function test_onlyOwner_guards() public {
        _agentSeedSellOpen();
        vm.startPrank(alice);
        vm.expectRevert();
        wd.closeDeposits();
        vm.expectRevert();
        wd.pause();
        vm.expectRevert();
        wd.enableRefundMode();
        vm.stopPrank();
    }

    
    function test_cannotRefundAfterSellingDeposits() public {
        _agentSeedSellOpen();
        _depositBoth();
        wd.closeDeposits();
        // owner sells some deposits, THEN tries refund mode -> blocked
        wd.sellRelinquished(100 ether, 0, block.timestamp + 1);
        vm.expectRevert(WaifuWinddown.AlreadySoldDeposits.selector);
        wd.enableRefundMode();
    }

    receive() external payable {}
}