// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IPresaleVaultForMocks {
	function deposit() external payable;
	function withdraw(uint256 amount) external;
	function refund() external;
	function claim() external;
}

contract ReentrantBnbReceiver {
	IPresaleVaultForMocks public vault;
	bool public attackWithdraw;
	bool public attackRefund;

	constructor(address _vault) {
		vault = IPresaleVaultForMocks(_vault);
	}

	function depositToVault() external payable {
		vault.deposit{value: msg.value}();
	}

	function withdrawFromVault(uint256 amount) external {
		attackWithdraw = true;
		vault.withdraw(amount);
		attackWithdraw = false;
	}

	function refundFromVault() external {
		attackRefund = true;
		vault.refund();
		attackRefund = false;
	}

	function claimFromVault() external {
		vault.claim();
	}

	receive() external payable {
		if (attackWithdraw) {
			vault.withdraw(0.001 ether);
		}
		if (attackRefund) {
			vault.refund();
		}
	}
}

contract ReentrantTokenMock is ERC20 {
	IPresaleVaultForMocks public vault;
	bool public attack;

	constructor() ERC20("Reentrant Token", "REENT") {}

	function setVault(address _vault) external {
		vault = IPresaleVaultForMocks(_vault);
	}

	function setAttack(bool _attack) external {
		attack = _attack;
	}

	function mint(address to, uint256 amount) external {
		_mint(to, amount);
	}

	function _afterTokenTransfer(address from, address to, uint256 amount) internal override {
		super._afterTokenTransfer(from, to, amount);
		if (attack && from != address(0) && to != address(0)) {
			vault.claim();
		}
	}
}

contract FalseReturnToken {
	string public name = "False Return Token";
	string public symbol = "FALSE";
	uint8 public decimals = 18;
	uint256 public totalSupply;
	mapping(address => uint256) public balanceOf;

	function mint(address to, uint256 amount) external {
		balanceOf[to] += amount;
		totalSupply += amount;
	}

	function transfer(address, uint256) external pure returns (bool) {
		return false;
	}
}

contract NoMoveToken {
	string public name = "No Move Token";
	string public symbol = "NOMOVE";
	uint8 public decimals = 18;
	uint256 public totalSupply;
	mapping(address => uint256) public balanceOf;

	function mint(address to, uint256 amount) external {
		balanceOf[to] += amount;
		totalSupply += amount;
	}

	function transfer(address, uint256) external pure returns (bool) {
		return true;
	}
}
