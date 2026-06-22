// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

interface IPancakeRouter02 {
    function WETH() external pure returns (address);
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}

/**
 * @title WaifuWinddown
 * @notice Honest wind-down of an immutable, ownership-renounced memecoin whose
 *         LP is permanently burned (liquidity cannot be removed, only sold into).
 *
 * Flow:
 *   1. SEED       owner deposits the controlled WAIFU (agent 10% + presale 20%).
 *   2. SELL       owner meters WAIFU -> BNB via the PancakeSwap router (TWAP,
 *                 slippage-guarded). Proceeds accumulate as native BNB here.
 *                 (Sequencing — e.g. agent tranche first for best price — is a
 *                 caller/script concern; the contract just sells what it's told.)
 *   3. FINALIZE   owner locks a Merkle root of {account => snapshotBalance} and
 *                 the totalSnapshotBalance the pot is divided across. Selling is
 *                 disabled after finalize so the pot is fixed.
 *   4. CLAIM      a holder proves their snapshot balance AND surrenders that many
 *                 live WAIFU to this contract (claim-by-surrender). They receive
 *                 pot * snapshotBalance / totalSnapshotBalance in BNB.
 *                 -> If they sold/transferred after the snapshot they no longer
 *                    hold the tokens, so they cannot claim. Enforces "snapshot
 *                    holders shouldn't sell" trustlessly, without controlling the
 *                    immutable token.
 *   5. SWEEP      after a grace window, owner sweeps unclaimed BNB + surrendered
 *                 WAIFU (to dead address / treasury).
 *
 * Owner powers are bounded: seed, sell (slippage-guarded), finalize-once, and
 * sweep-after-window. The owner CANNOT withdraw the BNB pot before finalize and
 * CANNOT alter per-holder shares (fixed by root + total). No upgradeability.
 */
contract WaifuWinddown is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable waifu;
    IPancakeRouter02 public immutable router;
    address public immutable dead = 0x000000000000000000000000000000000000dEaD;

    bool public finalized;
    bytes32 public merkleRoot;
    uint256 public totalSnapshotBalance; // denominator for pro-rata
    uint256 public potWei; // BNB pot fixed at finalize
    uint256 public claimDeadline; // after this, owner may sweep
    uint256 public immutable sweepGrace; // seconds after finalize before sweep

    mapping(address => bool) public claimed;
    uint256 public totalClaimedWei;
    uint256 public surrenderedWaifu;

    event Seeded(uint256 amount);
    event Sold(uint256 amountIn, uint256 bnbOut);
    event Finalized(bytes32 root, uint256 totalSnapshotBalance, uint256 potWei, uint256 claimDeadline);
    event Claimed(address indexed account, uint256 snapshotBalance, uint256 bnbOut, uint256 waifuSurrendered);
    event Swept(uint256 bnbWei, uint256 waifuAmount, address to);

    error AlreadyFinalized();
    error NotFinalized();
    error AlreadyClaimed();
    error BadProof();
    error InsufficientWaifu();
    error TransferFailed();
    error SweepTooEarly();
    error ZeroTotal();

    constructor(IERC20 _waifu, IPancakeRouter02 _router, uint256 _sweepGrace) Ownable() {
        waifu = _waifu;
        router = _router;
        sweepGrace = _sweepGrace;
    }

    receive() external payable {}

    // ----- Phase 1: seed -------------------------------------------------
    function seed(uint256 amount) external onlyOwner {
        if (finalized) revert AlreadyFinalized();
        waifu.safeTransferFrom(msg.sender, address(this), amount);
        emit Seeded(amount);
    }

    // ----- Phase 2: metered sell ----------------------------------------
    /// @notice Sell a tranche of WAIFU held by this contract into BNB.
    /// @param amountIn   WAIFU to sell this tranche.
    /// @param amountOutMin minimum BNB out (slippage / sandwich guard).
    /// @param deadline   unix deadline for the swap.
    function sellTranche(uint256 amountIn, uint256 amountOutMin, uint256 deadline)
        external
        onlyOwner
        nonReentrant
    {
        if (finalized) revert AlreadyFinalized();
        uint256 before = address(this).balance;
        waifu.forceApprove(address(router), amountIn);
        address[] memory path = new address[](2);
        path[0] = address(waifu);
        path[1] = router.WETH();
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            amountIn, amountOutMin, path, address(this), deadline
        );
        uint256 got = address(this).balance - before;
        emit Sold(amountIn, got);
    }

    // ----- Phase 3: finalize --------------------------------------------
    function finalize(bytes32 _root, uint256 _totalSnapshotBalance) external onlyOwner {
        if (finalized) revert AlreadyFinalized();
        if (_totalSnapshotBalance == 0) revert ZeroTotal();
        finalized = true;
        merkleRoot = _root;
        totalSnapshotBalance = _totalSnapshotBalance;
        potWei = address(this).balance;
        claimDeadline = block.timestamp + sweepGrace;
        emit Finalized(_root, _totalSnapshotBalance, potWei, claimDeadline);
    }

    // ----- Phase 4: claim-by-surrender ----------------------------------
    /// @notice Claim your pro-rata BNB by surrendering your snapshot WAIFU.
    /// @param snapshotBalance your balance at the snapshot block (leaf input).
    /// @param proof Merkle proof for leaf keccak256(abi.encodePacked(msg.sender, snapshotBalance)).
    function claim(uint256 snapshotBalance, bytes32[] calldata proof) external nonReentrant {
        if (!finalized) revert NotFinalized();
        if (claimed[msg.sender]) revert AlreadyClaimed();

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, snapshotBalance))));
        if (!MerkleProof.verify(proof, merkleRoot, leaf)) revert BadProof();

        // claim-by-surrender: caller must still hold >= snapshotBalance and
        // hand those tokens to the contract. Sold after snapshot => can't claim.
        if (waifu.balanceOf(msg.sender) < snapshotBalance) revert InsufficientWaifu();

        claimed[msg.sender] = true;
        uint256 payout = (potWei * snapshotBalance) / totalSnapshotBalance;
        totalClaimedWei += payout;
        surrenderedWaifu += snapshotBalance;

        waifu.safeTransferFrom(msg.sender, address(this), snapshotBalance);

        (bool ok, ) = payable(msg.sender).call{value: payout}("");
        if (!ok) revert TransferFailed();

        emit Claimed(msg.sender, snapshotBalance, payout, snapshotBalance);
    }

    // ----- Phase 5: sweep -----------------------------------------------
    function sweep(address to) external onlyOwner nonReentrant {
        if (!finalized) revert NotFinalized();
        if (block.timestamp < claimDeadline) revert SweepTooEarly();
        uint256 bnb = address(this).balance;
        uint256 wf = waifu.balanceOf(address(this));
        if (wf > 0) waifu.safeTransfer(to, wf);
        if (bnb > 0) {
            (bool ok, ) = payable(to).call{value: bnb}("");
            if (!ok) revert TransferFailed();
        }
        emit Swept(bnb, wf, to);
    }

    // ----- views ---------------------------------------------------------
    function quoteClaim(uint256 snapshotBalance) external view returns (uint256) {
        if (!finalized || totalSnapshotBalance == 0) return 0;
        return (potWei * snapshotBalance) / totalSnapshotBalance;
    }
}
