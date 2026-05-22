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

// slither-disable-start incorrect-equality,reentrancy-balance,reentrancy-benign,reentrancy-no-eth

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title VeWaifuStaking
/// @notice Stake WAIFU to earn proportional protocol fee rewards (Synthetix pattern).
/// @dev No lock period in v1. stakingToken == rewardToken == WAIFU.
contract VeWaifuStaking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant rewardsDuration = 7 days;

    IERC20 public immutable waifuToken;
    address public rewardDistributor;

    uint256 private _totalStaked;
    mapping(address => uint256) private _balances;

    uint256 public rewardPerTokenStored;
    uint256 public lastUpdateTime;
    uint256 public rewardRate;
    uint256 public periodFinish;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 reward);
    event RewardNotified(uint256 reward);
    event RewardDistributorSet(address indexed distributor);

    error ZeroAmount();
    error NotRewardDistributor();
    error NoStakers();
    error ZeroAddress();

    modifier onlyRewardDistributor() {
        if (msg.sender != rewardDistributor) revert NotRewardDistributor();
        _;
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    constructor(address waifuToken_) {
        if (waifuToken_ == address(0)) revert ZeroAddress();
        waifuToken = IERC20(waifuToken_);
    }

    function totalStaked() external view returns (uint256) {
        return _totalStaked;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerToken() public view returns (uint256) {
        if (_totalStaked == 0) {
            return rewardPerTokenStored;
        }
        return rewardPerTokenStored + ((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * 1e18) / _totalStaked;
    }

    function earned(address account) public view returns (uint256) {
        return (_balances[account] * (rewardPerToken() - userRewardPerTokenPaid[account])) / 1e18 + rewards[account];
    }

    function stake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();
        uint256 balanceBefore = waifuToken.balanceOf(address(this));
        waifuToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = waifuToken.balanceOf(address(this)) - balanceBefore;
        if (received == 0) revert ZeroAmount();
        _totalStaked += received;
        _balances[msg.sender] += received;
        emit Staked(msg.sender, received);
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
        uint256 reward = rewards[msg.sender];
        if (bal > 0) {
            _totalStaked -= bal;
            _balances[msg.sender] = 0;
        }
        if (reward > 0) {
            rewards[msg.sender] = 0;
        }
        if (bal > 0) {
            waifuToken.safeTransfer(msg.sender, bal);
            emit Withdrawn(msg.sender, bal);
        }
        if (reward > 0) {
            waifuToken.safeTransfer(msg.sender, reward);
            emit RewardClaimed(msg.sender, reward);
        }
    }

    function notifyRewardAmount(uint256 reward) external nonReentrant onlyRewardDistributor updateReward(address(0)) {
        if (reward == 0) revert ZeroAmount();
        if (_totalStaked == 0) revert NoStakers();
        uint256 balanceBefore = waifuToken.balanceOf(address(this));
        waifuToken.safeTransferFrom(msg.sender, address(this), reward);
        uint256 received = waifuToken.balanceOf(address(this)) - balanceBefore;
        if (received == 0) revert ZeroAmount();
        if (block.timestamp >= periodFinish) {
            rewardRate = received / rewardsDuration;
        } else {
            uint256 remaining = periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            rewardRate = (received + leftover) / rewardsDuration;
        }
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + rewardsDuration;
        emit RewardNotified(received);
    }

    function setRewardDistributor(address distributor_) external onlyOwner {
        if (distributor_ == address(0)) revert ZeroAddress();
        rewardDistributor = distributor_;
        emit RewardDistributorSet(distributor_);
    }
}

// slither-disable-end incorrect-equality,reentrancy-balance,reentrancy-benign,reentrancy-no-eth
