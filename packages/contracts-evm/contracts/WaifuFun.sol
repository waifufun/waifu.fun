// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IWaifuFun.sol";
import "./interfaces/IWaifuFunToken.sol";
import "./interfaces/IWaifuFunTokenFactory.sol";
import "./WaifuFunToken.sol";

contract WaifuFun is
    Ownable2StepUpgradeable,
    ReentrancyGuardUpgradeable,
    IWaifuFun
{
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    IWaifuFunTokenFactory public factory;

    ConfigParams public globalConfig;

    uint256 public constant BONDING_CURVE_FIXED_POINT = 1_000_000; // 100% = 1_000_000
    uint256 public constant FEE_FIXED_POINT = 10_000;

    /// @notice launcher => token address
    mapping(address => EnumerableSet.AddressSet) private tokensByLauncher;

    /// @notice token => bonding curve config
    mapping(address => BondingCurve) public bondingCurvesByToken;

    EnumerableSet.AddressSet private launchedTokens;

    function initialize(ConfigParams memory _params) public initializer {
        __Ownable2Step_init();
        __ReentrancyGuard_init();
        globalConfig = _params;
    }

    function updateFactory(address _factory) external onlyOwner {
        factory = IWaifuFunTokenFactory(_factory);
        emit WaifuFunTokenFactoryUpdated(_factory);
    }

    function updateGlobalConfig(
        ConfigParams memory _newGlobalParams
    ) external onlyOwner {
        globalConfig = _newGlobalParams;
    }

    function launch(
        uint256 _totalSupply,
        uint256 _virtualReserveETHAmount,
        uint8 _decimals,
        string memory _name,
        string memory _symbol
    ) external nonReentrant {
        _launch(
            _totalSupply,
            _virtualReserveETHAmount,
            _decimals,
            _name,
            _symbol
        );
    }

    function swap(SwapParameter memory _param) external payable nonReentrant {
        _swap(_param);
    }

    function launchAndSwap(
        uint256 _totalSupply,
        uint256 _virtualReserveETHAmount,
        uint8 _decimals,
        string memory _name,
        string memory _symbol,
        SwapParameter memory _param
    ) external payable nonReentrant {
        address tokenAddress = _launch(
            _totalSupply,
            _virtualReserveETHAmount,
            _decimals,
            _name,
            _symbol
        );
        _param.token = tokenAddress;
        _swap(_param);
    }

    function withdraw(address _token) external onlyOwner {
        BondingCurve storage bondingCurve = bondingCurvesByToken[_token];
        require(bondingCurve.isCompleted, "BONDING_CURVE_IS_NOT_COMPLETED");

        uint256 ethAmountToWithdraw = bondingCurve.reserveETHAmount -
            bondingCurve.initReserveETHAmount;
        uint256 tokenAmountToWithdraw = bondingCurve.reserveTokenAmount;

        _transferETHTo(owner(), ethAmountToWithdraw);
        if (tokenAmountToWithdraw > 0) {
            IERC20(_token).safeTransfer(owner(), tokenAmountToWithdraw);
        }

        (bondingCurve.reserveETHAmount, bondingCurve.reserveTokenAmount) = (
            0,
            0
        );

        emit Withdrawn(_token, ethAmountToWithdraw, tokenAmountToWithdraw);
    }

    function getLaunchedTokensByOwner(
        address _launcher
    ) external view returns (address[] memory) {
        return tokensByLauncher[_launcher].values();
    }

    function getAllLaunchedTokens() external view returns (address[] memory) {
        return launchedTokens.values();
    }

    receive() external payable {}

    function _launch(
        uint256 _totalSupply,
        uint256 _virtualReserveETHAmount,
        uint8 _decimals,
        string memory _name,
        string memory _symbol
    ) internal returns (address) {
        _validateAmount(_totalSupply, _virtualReserveETHAmount, _decimals);

        address launcher = msg.sender;
        address deployedTokenAddress = factory.deployToken(
            _name,
            _symbol,
            _totalSupply,
            _decimals
        );
        tokensByLauncher[launcher].add(deployedTokenAddress);
        launchedTokens.add(deployedTokenAddress);

        (
            uint256 bondingCurveAmount,
            uint256 amountToTeam
        ) = _deployAndUpdateBondingCurve(
                deployedTokenAddress,
                _virtualReserveETHAmount,
                _totalSupply
            );

        IWaifuFunToken(deployedTokenAddress).mintToken(
            globalConfig.teamWallet,
            amountToTeam
        );
        IWaifuFunToken(deployedTokenAddress).mintToken(
            address(this),
            bondingCurveAmount
        );

        emit TokenLaunched(
            _totalSupply,
            _virtualReserveETHAmount,
            _decimals,
            _name,
            _symbol
        );

        return deployedTokenAddress;
    }

    function _swap(SwapParameter memory _param) internal {
        BondingCurve storage bondingCurve = bondingCurvesByToken[_param.token];
        address sender = msg.sender;
        require(
            _param.amountIn > 0 &&
                (_param.direction == 1 || msg.value == _param.amountIn),
            "INVALID_AMOUNT_IN"
        );
        require(!bondingCurve.isCompleted, "CURVE_ALREADY_COMPLETED");
        require(block.timestamp < _param.deadline, "INSTRUCTION_EXPIRED");

        (
            uint256 amountToSwap,
            uint256 refundAmount,
            uint256 adjustedMinAmountOut
        ) = _getAdjustedAmounts(
                _param.token,
                _param.amountIn,
                _param.minAmountOut,
                _param.direction
            );

        (
            uint256 adjustedAmount,
            uint256 amountOut,
            uint256 feeAmount
        ) = _getAmountOut(_param.token, amountToSwap, _param.direction);
        require(amountOut >= adjustedMinAmountOut, "BELOW_MIN_AMOUNT_OUT");

        {
            uint256 reserveETHAmount;
            uint256 reserveTokenAmount;
            // 0: buy: swap ETH -> Token
            // 1: sell: swap Token -> ETH
            if (_param.direction == 0) {
                reserveETHAmount =
                    bondingCurve.reserveETHAmount +
                    adjustedAmount;
                reserveTokenAmount =
                    bondingCurve.reserveTokenAmount -
                    amountOut;
            } else {
                reserveETHAmount = bondingCurve.reserveETHAmount - amountOut;
                reserveTokenAmount =
                    bondingCurve.reserveTokenAmount +
                    adjustedAmount;
            }

            bool isCompleted = _updateReserve(
                _param.token,
                reserveTokenAmount,
                reserveETHAmount
            );
            if (isCompleted || refundAmount > 0) {
                bondingCurve.isCompleted = true;
                emit BondingCurveCompleted(_param.token, sender);
            }

            if (refundAmount > 0) {
                // direction - 1: sell => no choice that refundAmount can be greater than 0.
                // direction - 0: buy => if amountIn is greater than remain amount, refund amount will be greater than 0.
                _transferETHTo(sender, refundAmount);
            }

            if (_param.direction == 0) {
                // direction - 0: buy => user sends ETH and receive token.
                if (feeAmount > 0) {
                    _transferETHTo(globalConfig.teamWallet, feeAmount);
                    IERC20(_param.token).safeTransfer(sender, amountOut);
                }
            } else {
                // direction - 1: sell => user sends token and receive ETH.
                IERC20(_param.token).transferFrom(
                    sender,
                    address(this),
                    amountToSwap
                );
                IERC20(_param.token).safeTransfer(
                    globalConfig.teamWallet,
                    feeAmount
                );
                _transferETHTo(sender, amountOut);
            }
        }

        emit SwapExecuted(
            sender,
            _param.token,
            amountToSwap,
            adjustedMinAmountOut,
            _param.direction
        );
    }

    function _validateAmount(
        uint256 _totalSupply,
        uint256 _reserveETHAmount,
        uint8 _decimals
    ) internal view {
        require(
            _decimals >= globalConfig.minDecimal &&
                _decimals <= globalConfig.maxDecimal,
            "INVALID_DECIMAL"
        );

        uint256 tokenDecimal = 10 ** _decimals;
        require(
            _totalSupply % tokenDecimal == 0,
            "INVALID_TOTAL_SUPPLY_BY_DECIMAL"
        );

        uint256 totalSupplyExcludeDecimal = _totalSupply / tokenDecimal;
        require(
            totalSupplyExcludeDecimal >= globalConfig.minTotalSupply &&
                totalSupplyExcludeDecimal <= globalConfig.maxTotalSupply,
            "INVALID_TOTAL_SUPPLY"
        );

        require(
            _reserveETHAmount >= globalConfig.minETHAmount &&
                _reserveETHAmount <= globalConfig.maxETHAmount,
            "INVALID_RESERVE_ETH_AMOUNT"
        );
    }

    function _deployAndUpdateBondingCurve(
        address _deployedToken,
        uint256 _reserveETHAmount,
        uint256 _totalSupply
    ) internal returns (uint256 bondingCurveAmount, uint256 amountToTeam) {
        (
            address deployedToken,
            uint256 reserveETHAmount,
            uint256 totalSupply
        ) = (_deployedToken, _reserveETHAmount, _totalSupply);

        bondingCurveAmount =
            (totalSupply * globalConfig.initBondingCurveRate) /
            BONDING_CURVE_FIXED_POINT;
        amountToTeam = totalSupply - bondingCurveAmount;

        bondingCurvesByToken[deployedToken] = BondingCurve(
            deployedToken,
            msg.sender,
            reserveETHAmount,
            bondingCurveAmount,
            reserveETHAmount,
            globalConfig.curveLimit,
            false
        );
    }

    function _getAdjustedAmounts(
        address _token,
        uint256 _amountIn,
        uint256 _minAmountOut,
        uint8 _direction
    )
        internal
        view
        returns (
            uint256 amountToSwap,
            uint256 refundAmount,
            uint256 adjustedMinAmountOut
        )
    {
        BondingCurve memory bondingCurve = bondingCurvesByToken[_token];

        // buy: swap ETH -> Token
        // sell: swap Token -> ETH
        if (_direction == 0) {
            // buy: check remain amount based on curve limit
            uint256 remainAmount = bondingCurve.curveLimit -
                bondingCurve.reserveETHAmount;

            if (_amountIn > remainAmount) {
                adjustedMinAmountOut =
                    (_minAmountOut * remainAmount) /
                    _amountIn;
                (amountToSwap, refundAmount) = (
                    remainAmount,
                    _amountIn - remainAmount
                );
            } else {
                (amountToSwap, refundAmount, adjustedMinAmountOut) = (
                    _amountIn,
                    0,
                    _minAmountOut
                );
            }
        } else {
            (amountToSwap, refundAmount, adjustedMinAmountOut) = (
                _amountIn,
                0,
                _minAmountOut
            );
        }
    }

    // xy = k => Constant product formula
    // (x + dx)(y - dy) = k
    // y - dy = k / (x + dx)
    // y - dy = xy / (x + dx)
    // dy = y - (xy / (x + dx))
    // dy = yx + ydx - xy / (x + dx)
    // formula => dy = ydx / (x + dx)
    function _getAmountOut(
        address _token,
        uint256 _amount,
        uint8 _direction
    ) internal view returns (uint256, uint256, uint256) {
        BondingCurve memory bondingCurve = bondingCurvesByToken[_token];
        uint256 feeBasisPoint = _direction == 0
            ? globalConfig.buyFee
            : globalConfig.sellFee;
        uint256 feeAmount = (_amount * feeBasisPoint) / FEE_FIXED_POINT;
        uint256 adjustedAmount = _amount - feeAmount;
        uint256 amountOut;

        if (_direction == 0) {
            // Buying tokens with ETH: dx = (x * dy) / (y + dy)
            uint256 numerator = bondingCurve.reserveTokenAmount *
                adjustedAmount;
            uint256 denominator = bondingCurve.reserveETHAmount +
                adjustedAmount;
            amountOut = numerator / denominator;
        } else {
            // Selling tokens for ETH: dy = (y * dx) / (x + dx)
            uint256 numerator = bondingCurve.reserveETHAmount * adjustedAmount;
            uint256 denominator = bondingCurve.reserveTokenAmount +
                adjustedAmount;
            amountOut = numerator / denominator;
        }

        return (adjustedAmount, amountOut, feeAmount);
    }

    function _updateReserve(
        address _token,
        uint256 _reserveToken,
        uint256 _reserveETH
    ) internal returns (bool) {
        BondingCurve storage bondingCurve = bondingCurvesByToken[_token];
        (bondingCurve.reserveETHAmount, bondingCurve.reserveTokenAmount) = (
            _reserveETH,
            _reserveToken
        );

        return bondingCurve.reserveETHAmount >= bondingCurve.curveLimit;
    }

    function _transferETHTo(address _recipient, uint256 _value) internal {
        (bool success, ) = _recipient.call{value: _value}("");
        require(success, "TRANSFER_ETH_FAILED");
    }
}
