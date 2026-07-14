// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";

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
 * @notice Honest wind-down of $WAIFU (FlapTaxTokenV3: immutable, ownership
 *         renounced, LP permanently burned, 3% buy/3% sell tax on pool trades,
 *         wallet->wallet transfers untaxed). Liquidity can't be removed, only
 *         sold into.
 *
 * Two-window, deposit-funded model (the pot GROWS with participation):
 *   A. seed + sell AGENT tokens FIRST (before deposits) -> base BNB pot, crashes
 *      the float so depositing is the rational exit. openDeposits() is a one-way
 *      gate; after it, sellAgent is disabled so depositor tokens can never be
 *      sold as "agent".
 *   B. ~1wk DEPOSIT WINDOW: holders deposit() WAIFU (deposit->contract is
 *      wallet-to-wallet = UNTAXED, so the contract receives exactly `amount`;
 *      we still credit by measured balance-delta to be fee-on-transfer-safe).
 *   C. closeDeposits() -> sellRelinquished() sells ALL deposited WAIFU into the
 *      LP (3% sell tax skimmed by the token; we measure BNB by balance-delta so
 *      the pot reflects ACTUAL proceeds) -> finalize() locks pot + total.
 *   D. ~30d CLAIM WINDOW: claim() pays pot * yourDeposit / totalDeposited (BNB).
 *   E. sweep() after window: unclaimed BNB + dust -> treasury.
 *
 * Hardening:
 *   - Pausable: owner can pause deposit/claim if something is wrong mid-flight.
 *   - Sell proceeds + deposit credit measured by BALANCE DELTA (tax/FoT-safe).
 *   - Per-call swap deadline must be in the future (stale-tx guard).
 *   - emergencyRefund(): if a sale path breaks and the wind-down is abandoned
 *     BEFORE finalize, owner can flip to a refund mode so depositors reclaim
 *     their WAIFU 1:1 (no funds trapped). Mutually exclusive with finalize.
 *   - Owner cannot withdraw the BNB pot before finalize, cannot alter weights,
 *     cannot sell depositor tokens as agent. No upgradeability. CEI + nonReentrant.
 */
contract WaifuWinddown is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable waifu;
    IPancakeRouter02 public immutable router;

    bool public depositsOpen;
    bool public depositsClosed;
    bool public finalized;
    bool public refundMode; // emergency: depositors reclaim WAIFU 1:1 instead of BNB
    bool public relinquishedSold; // true once any deposited WAIFU has been sold

    uint256 public totalDeposited; // pro-rata denominator (measured credits)
    mapping(address => uint256) public deposited;
    mapping(address => bool) public claimed;

    uint256 public potWei; // BNB pot fixed at finalize
    uint256 public claimDeadline; // after this, owner may sweep
    uint256 public immutable claimWindow; // seconds after finalize before sweep

    event AgentSeeded(uint256 amount);
    event AgentSold(uint256 amountIn, uint256 bnbOut);
    event DepositsOpened();
    event Deposited(address indexed user, uint256 credited, uint256 newTotal);
    event DepositsClosed(uint256 totalDeposited);
    event RelinquishedSold(uint256 amountIn, uint256 bnbOut);
    event Finalized(uint256 potWei, uint256 totalDeposited, uint256 claimDeadline);
    event Claimed(address indexed user, uint256 deposit, uint256 bnbOut);
    event RefundModeEnabled();
    event Refunded(address indexed user, uint256 amount);
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
    error NoTokensReceived();
    error TransferFailed();
    error SweepTooEarly();
    error BadDeadline();
    error RefundActive();
    error RefundNotActive();
    error AlreadySoldDeposits();
    error ZeroAddress();

    constructor(IERC20 _waifu, IPancakeRouter02 _router, uint256 _claimWindow) Ownable() {
        if (address(_waifu) == address(0) || address(_router) == address(0)) revert ZeroAddress();
        waifu = _waifu;
        router = _router;
        claimWindow = _claimWindow;
    }

    receive() external payable {}

    // ----- Phase A: agent seed + sell (before deposits open) ------------
    function seedAgent(uint256 amount) external onlyOwner {
        if (depositsOpen) revert DepositsAlreadyOpen();
        if (amount == 0) revert ZeroAmount();
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
    /// @notice Deposit WAIFU to participate. Credited by MEASURED balance delta
    ///         (tax/fee-on-transfer-safe). WAIFU deposit is wallet->contract =
    ///         untaxed on FlapTaxTokenV3, so credit == amount in practice.
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (!depositsOpen) revert DepositsNotOpen();
        if (depositsClosed) revert DepositsAreClosed();
        if (refundMode) revert RefundActive();
        if (amount == 0) revert ZeroAmount();

        uint256 before = waifu.balanceOf(address(this));
        waifu.safeTransferFrom(msg.sender, address(this), amount);
        uint256 credited = waifu.balanceOf(address(this)) - before;
        if (credited == 0) revert NoTokensReceived();

        deposited[msg.sender] += credited;
        totalDeposited += credited;
        emit Deposited(msg.sender, credited, totalDeposited);
    }

    // ----- Phase C: close + sell relinquished + finalize ----------------
    function closeDeposits() external onlyOwner {
        if (!depositsOpen) revert DepositsNotOpen();
        if (depositsClosed) revert DepositsAreClosed();
        depositsClosed = true;
        emit DepositsClosed(totalDeposited);
    }

    /// @notice Sell deposited WAIFU into BNB after the window. Meter across calls
    ///         (TWAP) to limit price impact. BNB proceeds measured by delta.
    function sellRelinquished(uint256 amountIn, uint256 amountOutMin, uint256 deadline)
        external
        onlyOwner
        nonReentrant
    {
        if (!depositsClosed) revert DepositsNotClosed();
        if (finalized) revert AlreadyFinalized();
        if (refundMode) revert RefundActive();
        relinquishedSold = true;
        uint256 got = _swapToBnb(amountIn, amountOutMin, deadline);
        emit RelinquishedSold(amountIn, got);
    }

    function finalize() external onlyOwner {
        if (!depositsClosed) revert DepositsNotClosed();
        if (finalized) revert AlreadyFinalized();
        if (refundMode) revert RefundActive();
        if (totalDeposited == 0) revert NothingDeposited();
        finalized = true;
        potWei = address(this).balance;
        claimDeadline = block.timestamp + claimWindow;
        emit Finalized(potWei, totalDeposited, claimDeadline);
    }

    // ----- Phase D: claim (pro-rata by deposit) -------------------------
    function claim() external nonReentrant whenNotPaused {
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

    // ----- Emergency: refund mode (before finalize only) ----------------
    /// @notice If the wind-down must be abandoned BEFORE finalize (e.g. sell
    ///         path broken), enable refund mode so depositors reclaim their
    ///         WAIFU 1:1. Mutually exclusive with finalize -> no double payout.
    function enableRefundMode() external onlyOwner {
        if (finalized) revert AlreadyFinalized();
        if (relinquishedSold) revert AlreadySoldDeposits();
        refundMode = true;
        emit RefundModeEnabled();
    }

    /// @notice Reclaim your deposited WAIFU 1:1 when refund mode is active.
    /// @dev Only safe because no relinquished tokens have been sold once we
    ///      commit to refund (owner must enable refund BEFORE selling deposits).
    function refund() external nonReentrant {
        if (!refundMode) revert RefundNotActive();
        uint256 dep = deposited[msg.sender];
        if (dep == 0) revert NothingDeposited();
        deposited[msg.sender] = 0;
        totalDeposited -= dep;
        waifu.safeTransfer(msg.sender, dep);
        emit Refunded(msg.sender, dep);
    }

    // ----- Phase E: sweep -----------------------------------------------
    function sweep(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
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

    // ----- pause controls ------------------------------------------------
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ----- internal ------------------------------------------------------
    function _swapToBnb(uint256 amountIn, uint256 amountOutMin, uint256 deadline)
        internal
        returns (uint256 got)
    {
        if (amountIn == 0) revert ZeroAmount();
        if (deadline < block.timestamp) revert BadDeadline();
        uint256 bnbBefore = address(this).balance;
        waifu.forceApprove(address(router), amountIn);
        address[] memory path = new address[](2);
        path[0] = address(waifu);
        path[1] = router.WETH();
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            amountIn, amountOutMin, path, address(this), deadline
        );
        // reset approval to 0 (defensive: no lingering allowance to the router)
        waifu.forceApprove(address(router), 0);
        got = address(this).balance - bnbBefore;
    }

    // ----- views ---------------------------------------------------------
    function quoteClaim(address user) external view returns (uint256) {
        if (!finalized || totalDeposited == 0) return 0;
        return (potWei * deposited[user]) / totalDeposited;
    }
}
