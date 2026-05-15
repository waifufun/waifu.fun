// SPDX-License-Identifier: MIT
//
//   ╭┈┈┈ waifu.fun ┈┈┈╮
//   │  VeWaifuStaking  │
//   │  vote-escrowed   │
//   ╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯
//
//     ✿  lock WAIFU, earn say  ✿
//
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title VeWaifuStaking
/// @notice Stake WAIFU to earn proportional protocol fee rewards (Synthetix pattern).
/// @dev No lock period in v1. stakingToken == rewardToken == WAIFU.
contract VeWaifuStaking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable waifuToken;
    address public rewardDistributor;

    uint256 private _totalStaked;
    mapping(address => uint256) private _balances;

    uint256 public rewardPerTokenStored;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 reward);
    event RewardNotified(uint256 reward);

    error ZeroAmount();
    error NotRewardDistributor();
    error NoStakers();

    modifier onlyRewardDistributor() {
        if (msg.sender != rewardDistributor) revert NotRewardDistributor();
        _;
    }

    modifier updateReward(address account) {
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    constructor(address waifuToken_) {
        waifuToken = IERC20(waifuToken_);
    }

    function totalStaked() external view returns (uint256) {
        return _totalStaked;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function earned(address account) public view returns (uint256) {
        return (_balances[account] * (rewardPerTokenStored - userRewardPerTokenPaid[account])) / 1e18 + rewards[account];
    }

    function stake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();
        _totalStaked += amount;
        _balances[msg.sender] += amount;
        waifuToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();
        _totalStaked -= amount;
        _balances[msg.sender] -= amount;
        waifuToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function claimReward() external nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            waifuToken.safeTransfer(msg.sender, reward);
            emit RewardClaimed(msg.sender, reward);
        }
    }

    function exit() external nonReentrant updateReward(msg.sender) {
        uint256 bal = _balances[msg.sender];
        if (bal > 0) {
            _totalStaked -= bal;
            _balances[msg.sender] = 0;
            waifuToken.safeTransfer(msg.sender, bal);
            emit Withdrawn(msg.sender, bal);
        }
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            waifuToken.safeTransfer(msg.sender, reward);
            emit RewardClaimed(msg.sender, reward);
        }
    }

    function notifyRewardAmount(uint256 reward) external onlyRewardDistributor {
        if (_totalStaked == 0) revert NoStakers();
        rewardPerTokenStored += (reward * 1e18) / _totalStaked;
        emit RewardNotified(reward);
    }

    function setRewardDistributor(address distributor_) external onlyOwner {
        rewardDistributor = distributor_;
    }
}
