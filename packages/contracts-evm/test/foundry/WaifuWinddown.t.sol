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
        router = new MockRouter{value: 100 ether}(1e9); // 1e9 wei per WAIFU
        wd = new WaifuWinddown(IERC20(address(waifu)), IPancakeRouter02(address(router)), 30 days);
    }

    function _seedAndSell() internal {
        waifu.approve(address(wd), 300_000_000 ether);
        wd.seed(300_000_000 ether);
        wd.sellTranche(300_000_000 ether, 0, block.timestamp + 1);
    }

    // leaf = keccak256(keccak256(abi.encode(account, bal)))  (double-hash, OZ standard)
    function _leaf(address a, uint256 b) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(a, b))));
    }

    function test_seed_sell_accumulatesBnb() public {
        _seedAndSell();
        assertGt(address(wd).balance, 0, "pot funded");
    }

    function test_finalize_locksPotAndSelling() public {
        _seedAndSell();
        // two-leaf tree: alice 100, bob 300 -> total 400
        bytes32 la = _leaf(alice, 100 ether);
        bytes32 lb = _leaf(bob, 300 ether);
        bytes32 root = la < lb ? keccak256(abi.encode(la, lb)) : keccak256(abi.encode(lb, la));
        wd.finalize(root, 400 ether);
        assertTrue(wd.finalized());
        // selling disabled
        vm.expectRevert(WaifuWinddown.AlreadyFinalized.selector);
        wd.sellTranche(1 ether, 0, block.timestamp + 1);
    }

    function test_claimBySurrender_paysProRata_andPullsTokens() public {
        _seedAndSell();
        // give alice 100 WAIFU at "snapshot" (already holds via mint? no—transfer)
        waifu.transfer(alice, 100 ether);
        waifu.transfer(bob, 300 ether);
        bytes32 la = _leaf(alice, 100 ether);
        bytes32 lb = _leaf(bob, 300 ether);
        bytes32 root = la < lb ? keccak256(abi.encode(la, lb)) : keccak256(abi.encode(lb, la));
        wd.finalize(root, 400 ether);
        uint256 pot = wd.potWei();

        bytes32[] memory proofA = new bytes32[](1);
        proofA[0] = lb;
        vm.startPrank(alice);
        waifu.approve(address(wd), 100 ether);
        uint256 balBefore = alice.balance;
        wd.claim(100 ether, proofA);
        vm.stopPrank();

        assertEq(alice.balance - balBefore, pot * 100 ether / 400 ether, "alice pro-rata");
        assertEq(waifu.balanceOf(alice), 0, "tokens surrendered");
        assertTrue(wd.claimed(alice));
    }

    function test_soldAfterSnapshot_cannotClaim() public {
        _seedAndSell();
        // alice was on snapshot for 100 but sold/transferred them away -> holds 0
        bytes32 la = _leaf(alice, 100 ether);
        bytes32 lb = _leaf(bob, 300 ether);
        bytes32 root = la < lb ? keccak256(abi.encode(la, lb)) : keccak256(abi.encode(lb, la));
        wd.finalize(root, 400 ether);

        bytes32[] memory proofA = new bytes32[](1);
        proofA[0] = lb;
        vm.prank(alice);
        vm.expectRevert(WaifuWinddown.InsufficientWaifu.selector);
        wd.claim(100 ether, proofA);
    }

    function test_doubleClaim_reverts() public {
        _seedAndSell();
        waifu.transfer(alice, 100 ether);
        bytes32 la = _leaf(alice, 100 ether);
        bytes32 lb = _leaf(bob, 300 ether);
        bytes32 root = la < lb ? keccak256(abi.encode(la, lb)) : keccak256(abi.encode(lb, la));
        wd.finalize(root, 400 ether);
        bytes32[] memory proofA = new bytes32[](1);
        proofA[0] = lb;
        vm.startPrank(alice);
        waifu.approve(address(wd), 200 ether);
        wd.claim(100 ether, proofA);
        vm.expectRevert(WaifuWinddown.AlreadyClaimed.selector);
        wd.claim(100 ether, proofA);
        vm.stopPrank();
    }

    function test_badProof_reverts() public {
        _seedAndSell();
        waifu.transfer(alice, 100 ether);
        bytes32 la = _leaf(alice, 100 ether);
        bytes32 lb = _leaf(bob, 300 ether);
        bytes32 root = la < lb ? keccak256(abi.encode(la, lb)) : keccak256(abi.encode(lb, la));
        wd.finalize(root, 400 ether);
        bytes32[] memory bad = new bytes32[](1);
        bad[0] = bytes32(uint256(1));
        vm.prank(alice);
        vm.expectRevert(WaifuWinddown.BadProof.selector);
        wd.claim(100 ether, bad);
    }

    function test_sweep_onlyAfterWindow() public {
        _seedAndSell();
        bytes32 root = _leaf(alice, 100 ether);
        wd.finalize(root, 100 ether);
        vm.expectRevert(WaifuWinddown.SweepTooEarly.selector);
        wd.sweep(owner);
        vm.warp(block.timestamp + 31 days);
        wd.sweep(owner); // ok now
    }

    function test_claimBeforeFinalize_reverts() public {
        _seedAndSell();
        bytes32[] memory p = new bytes32[](0);
        vm.expectRevert(WaifuWinddown.NotFinalized.selector);
        wd.claim(100 ether, p);
    }

    receive() external payable {}
}
