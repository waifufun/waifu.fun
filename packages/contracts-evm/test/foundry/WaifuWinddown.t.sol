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

/// Mock router: WAIFU in -> fixed-rate BNB out (funded with ETH).
contract MockRouter is IPancakeRouter02 {
    uint256 public rate; // wei BNB per 1e18 WAIFU
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
        router = new MockRouter{value: 200 ether}(1e9); // 1e9 wei per WAIFU
        wd = new WaifuWinddown(IERC20(address(waifu)), IPancakeRouter02(address(router)), 30 days);
        // distribute test holdings
        waifu.transfer(alice, 100 ether);
        waifu.transfer(bob, 300 ether);
    }

    function _agentSeedSellOpen() internal {
        waifu.approve(address(wd), 100_000_000 ether);
        wd.seedAgent(100_000_000 ether);
        wd.sellAgent(100_000_000 ether, 0, block.timestamp + 1);
        wd.openDeposits();
    }

    function test_fullLifecycle_potGrowsWithDeposits() public {
        _agentSeedSellOpen();
        uint256 potAfterAgent = address(wd).balance;
        assertGt(potAfterAgent, 0, "agent funded base pot");

        // alice + bob deposit
        vm.startPrank(alice);
        waifu.approve(address(wd), 100 ether);
        wd.deposit(100 ether);
        vm.stopPrank();
        vm.startPrank(bob);
        waifu.approve(address(wd), 300 ether);
        wd.deposit(300 ether);
        vm.stopPrank();
        assertEq(wd.totalDeposited(), 400 ether);

        // close + sell the relinquished 400 -> pot grows
        wd.closeDeposits();
        wd.sellRelinquished(400 ether, 0, block.timestamp + 1);
        assertGt(address(wd).balance, potAfterAgent, "pot grew from relinquished sale");
        wd.finalize();
        uint256 pot = wd.potWei();

        // claims pro-rata by deposit
        uint256 aBefore = alice.balance;
        vm.prank(alice);
        wd.claim();
        assertEq(alice.balance - aBefore, pot * 100 ether / 400 ether, "alice pro-rata");

        uint256 bBefore = bob.balance;
        vm.prank(bob);
        wd.claim();
        assertEq(bob.balance - bBefore, pot * 300 ether / 400 ether, "bob pro-rata");
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
        // bob never deposited
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

    receive() external payable {}
}
