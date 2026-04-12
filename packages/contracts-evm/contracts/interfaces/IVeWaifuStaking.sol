// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IVeWaifuStaking
/// @notice Interface for the veWAIFU staking contract. Users stake WAIFU to earn
///         a proportional share of protocol fee rewards (also paid in WAIFU).
/// @dev Based on the Synthetix StakingRewards pattern. veWAIFU balances are
///      tracked internally (no separate ERC-20 token). No lock period in v1.
interface IVeWaifuStaking {
    //  Events 

    /// @notice Emitted when a user stakes WAIFU.
    /// @param user   The staker's address.
    /// @param amount The amount of WAIFU staked.
    event Staked(address indexed user, uint256 amount);

    /// @notice Emitted when a user withdraws staked WAIFU.
    /// @param user   The staker's address.
    /// @param amount The amount of WAIFU withdrawn.
    event Withdrawn(address indexed user, uint256 amount);

    /// @notice Emitted when a user claims accrued rewards.
    /// @param user   The staker's address.
    /// @param reward The amount of WAIFU reward claimed.
    event RewardClaimed(address indexed user, uint256 reward);

    /// @notice Emitted when the FeeRouter notifies new rewards.
    /// @param reward The amount of WAIFU added to the reward pool.
    event RewardAdded(uint256 reward);

    /// @notice Emitted when the rewards distributor address is updated.
    /// @param distributor The new distributor address.
    event RewardsDistributorUpdated(address indexed distributor);

    //  Errors 

    /// @notice Supplied amount is zero.
    error ZeroAmount();

    /// @notice Caller is not the authorized rewards distributor.
    error NotDistributor();

    /// @notice Supplied address is the zero address.
    error ZeroAddress();

    //  Functions 

    /// @notice Stake WAIFU tokens. Caller must have pre-approved this contract.
    /// @param amount The amount of WAIFU to stake.
    function stake(uint256 amount) external;

    /// @notice Withdraw previously staked WAIFU.
    /// @param amount The amount of WAIFU to withdraw.
    function withdraw(uint256 amount) external;

    /// @notice Claim all accrued WAIFU rewards.
    function claimReward() external;

    /// @notice Withdraw all staked WAIFU and claim all accrued rewards.
    function exit() external;

    /// @notice Called by the FeeRouter to notify new reward tokens available.
    /// @param reward The amount of WAIFU to distribute as rewards.
    function notifyRewardAmount(uint256 reward) external;

    /// @notice Set the authorized rewards distributor (FeeRouter).
    /// @param distributor The new distributor address.
    function setRewardsDistributor(address distributor) external;

    /// @notice Returns the user's staked (veWAIFU) balance.
    /// @param account The user address.
    /// @return The staked balance.
    function balanceOf(address account) external view returns (uint256);

    /// @notice Returns the total staked WAIFU across all users.
    /// @return The total staked amount.
    function totalSupply() external view returns (uint256);

    /// @notice Returns the current accumulated reward per token.
    /// @return The reward per token value (scaled by 1e18).
    function rewardPerToken() external view returns (uint256);

    /// @notice Returns the amount of rewards earned but not yet claimed.
    /// @param account The user address.
    /// @return The earned reward amount.
    function earned(address account) external view returns (uint256);
}
