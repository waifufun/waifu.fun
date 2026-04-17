// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IFeeRouter.sol";
import "./interfaces/IVeWaifuStaking.sol";

/// @title FeeRouter
/// @notice Receives WAIFU trading fees from WaifuFunV2 and splits them across
///         three destinations: the agent's treasury (50%), the platform wallet
///         (25%), and the veWAIFU staking rewards pool (25%).
/// @dev Immutable (no proxy). Only authorized callers (WaifuFunV2) can invoke
///      fee distribution. The caller must approve this contract to transfer
///      WAIFU before calling `distributeFees`.
contract FeeRouter is IFeeRouter, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Constants ─────────────────────────────────────────────────────

    /// @notice Basis points denominator (100%).
    uint256 private constant BPS = 10_000;

    /// @notice Agent treasury share: 50% (5000 bps).
    uint256 public constant AGENT_TREASURY_BPS = 5_000;

    /// @notice Platform wallet share: 25% (2500 bps).
    uint256 public constant PLATFORM_BPS = 2_500;

    /// @notice veWAIFU staking share: 25% (2500 bps).
    uint256 public constant STAKING_BPS = 2_500;

    // ─── Immutables ────────────────────────────────────────────────────

    /// @notice The WAIFU ERC-20 token used for all fee transfers.
    IERC20 public immutable waifuToken;

    // ─── State ─────────────────────────────────────────────────────────

    /// @notice The veWAIFU staking contract that receives 25% of fees.
    address public stakingContract;

    /// @notice The platform wallet that receives 25% of fees.
    address public platformWallet;

    /// @notice Maps agent token address to its treasury wallet.
    mapping(address => address) public override agentTreasuries;

    /// @notice Maps address to whether it can call `distributeFees`.
    mapping(address => bool) public override authorizedCallers;

    // ─── Constructor ───────────────────────────────────────────────────

    /// @param _waifuToken      Address of the WAIFU ERC-20 token.
    /// @param _stakingContract Address of the veWAIFU staking contract.
    /// @param _platformWallet  Address of the platform fee wallet.
    constructor(
        address _waifuToken,
        address _stakingContract,
        address _platformWallet
    ) Ownable() {
        if (_waifuToken == address(0)) revert ZeroAddress();
        if (_stakingContract == address(0)) revert ZeroAddress();
        if (_platformWallet == address(0)) revert ZeroAddress();

        waifuToken = IERC20(_waifuToken);
        stakingContract = _stakingContract;
        platformWallet = _platformWallet;
    }

    // ─── Modifiers ─────────────────────────────────────────────────────

    /// @dev Restricts access to authorized callers only.
    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender]) revert Unauthorized();
        _;
    }

    // ─── Core ──────────────────────────────────────────────────────────

    /// @inheritdoc IFeeRouter
    function distributeFees(
        address agentToken,
        uint256 amount
    ) external override onlyAuthorized nonReentrant {
        if (amount == 0) revert ZeroAmount();

        address treasury = agentTreasuries[agentToken];
        if (treasury == address(0)) revert NoTreasurySet(agentToken);

        // Calculate shares. Integer division means dust stays with treasury.
        uint256 platformShare = (amount * PLATFORM_BPS) / BPS;
        uint256 stakingShare = (amount * STAKING_BPS) / BPS;
        uint256 treasuryShare = amount - platformShare - stakingShare;

        // Pull total fees from caller in a single transferFrom.
        waifuToken.safeTransferFrom(msg.sender, address(this), amount);

        // Distribute to agent treasury.
        waifuToken.safeTransfer(treasury, treasuryShare);

        // Distribute to platform wallet.
        waifuToken.safeTransfer(platformWallet, platformShare);

        // Distribute to staking: approve + notify so staking contract pulls tokens.
        waifuToken.safeTransfer(stakingContract, stakingShare);
        IVeWaifuStaking(stakingContract).notifyRewardAmount(stakingShare);

        emit FeesDistributed(
            agentToken,
            amount,
            treasuryShare,
            platformShare,
            stakingShare
        );
    }

    // ─── Admin ─────────────────────────────────────────────────────────

    /// @inheritdoc IFeeRouter
    function setAgentTreasury(
        address agentToken,
        address treasury
    ) external override {
        require(msg.sender == owner() || authorizedCallers[msg.sender], "NOT_AUTHORIZED");
        if (agentToken == address(0)) revert ZeroAddress();
        if (treasury == address(0)) revert ZeroAddress();

        agentTreasuries[agentToken] = treasury;
        emit AgentTreasurySet(agentToken, treasury);
    }

    /// @inheritdoc IFeeRouter
    function setAuthorizedCaller(
        address caller,
        bool authorized
    ) external override onlyOwner {
        if (caller == address(0)) revert ZeroAddress();

        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerSet(caller, authorized);
    }

    /// @inheritdoc IFeeRouter
    function setPlatformWallet(address newWallet) external override onlyOwner {
        if (newWallet == address(0)) revert ZeroAddress();

        platformWallet = newWallet;
        emit PlatformWalletUpdated(newWallet);
    }

    /// @inheritdoc IFeeRouter
    function setStakingContract(address newStaking) external override onlyOwner {
        if (newStaking == address(0)) revert ZeroAddress();

        stakingContract = newStaking;
        emit StakingContractUpdated(newStaking);
    }
}
