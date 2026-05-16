// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";
import {LaunchVault} from "../contracts/LaunchVault.sol";
import {ERC20Mock} from "../contracts/mocks/ERC20Mock.sol";

contract VaultActor {
    receive() external payable {}

    function deposit(address vault, uint256 value) external returns (bool ok) {
        (ok,) = vault.call{value: value}(abi.encodeWithSignature("deposit()"));
    }

    function withdraw(address vault, uint256 amount) external returns (bool ok) {
        (ok,) = vault.call(abi.encodeWithSignature("withdraw(uint256)", amount));
    }

    function withdrawAll(address vault) external returns (bool ok) {
        (ok,) = vault.call(abi.encodeWithSignature("withdrawAll()"));
    }

    function refund(address vault) external returns (bool ok) {
        (ok,) = vault.call(abi.encodeWithSignature("refund()"));
    }

    function claim(address vault) external returns (bool ok) {
        (ok,) = vault.call(abi.encodeWithSignature("claim()"));
    }
}

contract LaunchVaultInvariantHandler is Test {
    LaunchVault public immutable vault;
    ERC20Mock public immutable token;
    VaultActor[3] public actors;

    uint256 internal constant TOKEN_SHARE = 320_000_000 ether;

    constructor(LaunchVault vault_, ERC20Mock token_) {
        vault = vault_;
        token = token_;
        for (uint256 i = 0; i < actors.length; i++) {
            actors[i] = new VaultActor();
            vm.deal(address(actors[i]), 96 ether);
        }
    }

    function deposit(uint8 actorId, uint96 amount) external {
        VaultActor actor = actors[actorId % actors.length];
        uint256 value = bound(uint256(amount), 0, 16 ether);
        actor.deposit(address(vault), value);
    }

    function withdraw(uint8 actorId, uint96 amount) external {
        actors[actorId % actors.length].withdraw(address(vault), uint256(amount));
    }

    function withdrawAll(uint8 actorId) external {
        actors[actorId % actors.length].withdrawAll(address(vault));
    }

    function close() external {
        try vault.close() {} catch {}
    }

    function pullAndDistribute() external {
        if (vault.state() != LaunchVault.State.CLOSED) return;
        if (vault.totalDeposited() < vault.presaleCap()) return;
        uint256 toPull = address(vault).balance;
        try vault.pullBnbForLaunch(toPull) {
            token.mint(address(vault), TOKEN_SHARE);
            try vault.distribute(address(token), TOKEN_SHARE) {} catch {}
        } catch {}
    }

    function enableRefundUnderSubscribed() external {
        vm.warp(vault.closeTimestamp() + 1);
        try vault.enableRefundUnderSubscribed() {} catch {}
    }

    function enableRefundLaunchExpired() external {
        vm.warp(vault.closeTimestamp() + vault.BUNDLE_GRACE_PERIOD());
        try vault.enableRefundLaunchExpired() {} catch {}
    }

    function refund(uint8 actorId) external {
        actors[actorId % actors.length].refund(address(vault));
    }

    function claim(uint8 actorId) external {
        actors[actorId % actors.length].claim(address(vault));
    }

    function actorAddress(uint256 idx) external view returns (address) {
        return address(actors[idx]);
    }
}

contract LaunchVaultInvariantTest is StdInvariant, Test {
    LaunchVault internal vault;
    ERC20Mock internal token;
    LaunchVaultInvariantHandler internal handler;

    uint256 internal constant PRESALE_CAP = 32 ether;
    uint256 internal constant QUOTE_AMT = 20 ether;
    uint256 internal constant V2_BUY = 12 ether;
    uint256 internal constant TOKEN_SHARE = 320_000_000 ether;

    function setUp() public {
        vault = new LaunchVault(
            address(this),
            address(this),
            address(this),
            PRESALE_CAP,
            QUOTE_AMT,
            V2_BUY,
            block.timestamp + 7 days,
            500,
            true
        );
        token = new ERC20Mock();
        handler = new LaunchVaultInvariantHandler(vault, token);
        vault.setRouter(address(handler));
        targetContract(address(handler));
    }

    function invariant_bnbConservation() public view {
        LaunchVault.State state = vault.state();
        uint256 expected = vault.totalDeposited() + vault.bonusPool();
        if (state == LaunchVault.State.OPEN || state == LaunchVault.State.CLOSED || state == LaunchVault.State.REFUND) {
            assertEq(address(vault).balance, expected);
        } else if (state == LaunchVault.State.LAUNCHED) {
            assertEq(address(vault).balance, 0);
        }
    }

    function invariant_capRespected() public view {
        assertLe(vault.totalDeposited(), vault.presaleCap());
        assertLe(vault.totalDepositedAtLaunch(), vault.presaleCap());
    }

    function invariant_claimsNeverExceedAllocation() public view {
        for (uint256 i = 0; i < 3; i++) {
            address actor = handler.actorAddress(i);
            (, uint256 claimed,) = vault.depositors(actor);
            assertLe(claimed, vault.allocationOf(actor));
        }
    }

    function invariant_distributionWellFormed() public view {
        if (vault.distributed()) {
            assertEq(uint256(vault.state()), uint256(LaunchVault.State.LAUNCHED));
            assertEq(vault.token(), address(token));
            assertEq(vault.presalerTokenBalance(), TOKEN_SHARE);
        }
    }
}
