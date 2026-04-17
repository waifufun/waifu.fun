// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IWaifuFunToken.sol";

contract WaifuFunToken is ERC20, Ownable, IWaifuFunToken {
    uint256 private _totalSupply;
    uint8 private _decimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 tokenSupply_,
        uint8 decimals_
    ) ERC20(name_, symbol_) {
        (_totalSupply, _decimals) = (tokenSupply_, decimals_);
        _mint(address(this), _totalSupply);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function totalSupply() public view virtual override returns (uint256) {
        return _totalSupply;
    }

    function mintToken(
        address _recipient,
        uint256 _amount
    ) external override onlyOwner {
        require(balanceOf(address(this)) >= _amount, "EXCEEDS_TOTAL_SUPPLY");
        _transfer(address(this), _recipient, _amount);
    }
}
