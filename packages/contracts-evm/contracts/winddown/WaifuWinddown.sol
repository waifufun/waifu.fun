// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

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
 *         LP is permanently burned (liquidity can't be removed, only sold into).
 *
 * Two-window, deposit-funded design (the pot GROWS with participation):
 *
 *   PHASE A  seed + agent sell (owner, BEFORE deposits open)
 *     Owner seeds the agent's controlled WAIFU and sells it into BNB. This
 *     loss-leader sale funds the base pot and crashes the float, so depositing
 *     becomes the rational exit for everyone else. openDeposits() is a one-way
 *     gate; once open, sellAgent is disabled so depositor tokens can never be
 *     sold as "agent" tokens.
 *
 *   PHASE B  DEPOSIT WINDOW (~1 week)
 *     Any holder calls deposit(amount): WAIFU escrowed, pro-rata weight recorded.
 *     Pooling everyone's selling power beats 100+ wallets dumping individually.
 *
 *   PHASE C  close + sell relinquished + finalize (owner)
 *     After the window, owner sells ALL deposited WAIFU into the LP (metered,
 *     slippage-guarded), growing the pot, then finalize() locks
 *     pot = contract BNB balance and total = total deposited.
 *
 *   PHASE D  CLAIM WINDOW (~30 days)
 *     Each depositor claims pot * theirDeposit / totalDeposited (BNB).
 *
 *   PHASE E  SWEEP
 *     After the claim window, owner sweeps unclaimed BNB + dust to treasury.
 *
 * Pro-rata is by DEPOSITED amount (no snapshot, no Merkle): you only share the
 * pot if you actually relinquished your tokens. Non-participants get nothing.
 *
 * Owner powers bounded: seed, sellAgent (pre-open, slippage-guarded),
 * openDeposits-once, closeDeposits-once, sellRelinquished (slippage-guarded),
 * finalize-once, sweep-after-window. Owner CANNOT withdraw BNB before finalize,
 * CANNOT alter pro-rata weights, and CANNOT sell depositor tokens as agent
 * (the openDeposits gate prevents it). No upgradeability.
 */
contract WaifuWinddown is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable waifu;
    IPancakeRouter02 public immutable router;

    bool public depositsOpen;
    bool public depositsClosed;
    bool public finalized;

    uint256 public totalDeposited; // pro-rata denominator
    mapping(address => uint256) public deposited;
    mapping(address => bool) public claimed;

    uint256 public potWei; // BNB pot fixed at finalize
    uint256 public claimDeadline; // after this, owner may sweep
    uint256 public immutable claimWindow; // seconds after finalize before sweep

    event AgentSeeded(uint256 amount);
    event AgentSold(uint256 amountIn, uint256 bnbOut);
    event DepositsOpened();
    event Deposited(address indexed user, uint256 amount, uint256 newTotal);
    event DepositsClosed(uint256 totalDeposited);
    event RelinquishedSold(uint256 amountIn, uint256 bnbOut);
    event Finalized(uint256 potWei, uint256 totalDeposited, uint256 claimDeadline);
    event Claimed(address indexed user, uint256 deposit, uint256 bnbOut);
    event Swept(uint256 bnbWei, uint256 waifuAmount, address to);

    error DepositsAreClosed();
    error DepositsNotOpen();
    error DepositsAlreadyOpen();
    error DepositsNotClosed();
    error AlreadyFinalized();
    error NotFinalized();
    error AlreadyClaimed();
    error NothingDeposited();
    error ZeroAmount();
    error TransferFailed();
    error SweepTooEarly();

    constructor(IERC20 _waifu, IPancakeRouter02 _router, uint256 _claimWindow) Ownable() {
        waifu = _waifu;
        router = _router;
        claimWindow = _claimWindow;
    }

    receive() external payable {}

    // ----- Phase A: agent seed + sell (before deposits open) ------------
    function seedAgent(uint256 amount) external onlyOwner {
        if (depositsOpen) revert DepositsAlreadyOpen();
        waifu.safeTransferFrom(msg.sender, address(this), amount);
        emit AgentSeeded(amount);
    }

    function sellAgent(uint256 amountIn, uint256 amountOutMin, uint256 deadline)
        external
        onlyOwner
        nonReentrant
    {
        if (depositsOpen) revert DepositsAlreadyOpen();
        uint256 got = _swapToBnb(amountIn, amountOutMin, deadline);
        emit AgentSold(amountIn, got);
    }

    /// @notice One-way gate: open the deposit window. Disables sellAgent so
    ///         depositor tokens can never be sold as "agent".
    function openDeposits() external onlyOwner {
        if (depositsOpen) revert DepositsAlreadyOpen();
        depositsOpen = true;
        emit DepositsOpened();
    }

    // ----- Phase B: deposit window --------------------------------------
    function deposit(uint256 amount) external nonReentrant {
        if (!depositsOpen) revert DepositsNotOpen();
        if (depositsClosed) revert DepositsAreClosed();
        if (amount == 0) revert ZeroAmount();
        deposited[msg.sender] += amount;
        totalDeposited += amount;
        waifu.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount, totalDeposited);
    }

    // ----- Phase C: close + sell relinquished + finalize ----------------
    function closeDeposits() external onlyOwner {
        if (!depositsOpen) revert DepositsNotOpen();
        if (depositsClosed) revert DepositsAreClosed();
        depositsClosed = true;
        emit DepositsClosed(totalDeposited);
    }

    function sellRelinquished(uint256 amountIn, uint256 amountOutMin, uint256 deadline)
        external
        onlyOwner
        nonReentrant
    {
        if (!depositsClosed) revert DepositsNotClosed();
        if (finalized) revert AlreadyFinalized();
        uint256 got = _swapToBnb(amountIn, amountOutMin, deadline);
        emit RelinquishedSold(amountIn, got);
    }

    function finalize() external onlyOwner {
        if (!depositsClosed) revert DepositsNotClosed();
        if (finalized) revert AlreadyFinalized();
        if (totalDeposited == 0) revert NothingDeposited();
        finalized = true;
        potWei = address(this).balance;
        claimDeadline = block.timestamp + claimWindow;
        emit Finalized(potWei, totalDeposited, claimDeadline);
    }

    // ----- Phase D: claim (pro-rata by deposit) -------------------------
    function claim() external nonReentrant {
        if (!finalized) revert NotFinalized();
        if (claimed[msg.sender]) revert AlreadyClaimed();
        uint256 dep = deposited[msg.sender];
        if (dep == 0) revert NothingDeposited();

        claimed[msg.sender] = true;
        uint256 payout = (potWei * dep) / totalDeposited;

        (bool ok, ) = payable(msg.sender).call{value: payout}("");
        if (!ok) revert TransferFailed();
        emit Claimed(msg.sender, dep, payout);
    }

    // ----- Phase E: sweep -----------------------------------------------
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

    // ----- internal ------------------------------------------------------
    function _swapToBnb(uint256 amountIn, uint256 amountOutMin, uint256 deadline)
        internal
        returns (uint256 got)
    {
        uint256 bnbBefore = address(this).balance;
        waifu.forceApprove(address(router), amountIn);
        address[] memory path = new address[](2);
        path[0] = address(waifu);
        path[1] = router.WETH();
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            amountIn, amountOutMin, path, address(this), deadline
        );
        got = address(this).balance - bnbBefore;
    }

    // ----- views ---------------------------------------------------------
    function quoteClaim(address user) external view returns (uint256) {
        if (!finalized || totalDeposited == 0) return 0;
        return (potWei * deposited[user]) / totalDeposited;
    }
}
