// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IWaifuFunV2.sol";
import "./interfaces/IWaifuFunToken.sol";
import "./interfaces/IWaifuFunTokenFactory.sol";
import "./interfaces/IPancakeSwap.sol";

/// @title WaifuFunV2
/// @notice WAIFU-denominated bonding curve engine with PancakeSwap V2 graduation.
/// @dev Immutable (no proxy pattern). Uses WAIFU ERC-20 as the base token for all
///      buy/sell operations. When a curve fills to its limit, it auto-graduates by
///      seeding a PancakeSwap V2 liquidity pool and burning the LP tokens.
///
///      Supply split on launch: 80% bonding curve, 10% agent treasury, 10% creator.
///      Fees are routed to a FeeRouter contract that handles downstream splits.
///
///      Constant-product AMM: xy = k
contract WaifuFunV2 is Ownable, ReentrancyGuard, IWaifuFunV2 {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    // --- Constants ---

    /// @notice Fixed-point denominator for supply split (100% = 1_000_000).
    uint256 public constant SUPPLY_FIXED_POINT = 1_000_000;

    /// @notice Fixed-point denominator for fees (100% = 10_000).
    uint256 public constant FEE_FIXED_POINT = 10_000;

    /// @notice Bonding curve receives 80% of total supply.
    uint256 public constant CURVE_SUPPLY_RATE = 800_000;

    /// @notice Agent treasury receives 10% of total supply.
    uint256 public constant TREASURY_SUPPLY_RATE = 100_000;

    /// @notice Creator receives 10% of total supply.
    uint256 public constant CREATOR_SUPPLY_RATE = 100_000;

    /// @notice Dead address for LP token burns.
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // --- Immutables ---

    /// @notice The WAIFU ERC-20 token used as the base currency.
    IERC20 public immutable waifuToken;

    /// @notice Address that receives all trading fees.
    address public immutable feeRouter;

    /// @notice PancakeSwap V2 Router for graduation liquidity.
    IUniswapV2Router02 public immutable pancakeRouter;

    /// @notice PancakeSwap V2 Factory for pair lookups.
    IUniswapV2Factory public immutable pancakeFactory;

    // --- State ---

    /// @notice Token factory used to deploy new agent tokens.
    IWaifuFunTokenFactory public factory;

    /// @notice Global configuration parameters.
    ConfigParams public globalConfig;

    /// @dev Launcher address => set of token addresses they launched.
    mapping(address => EnumerableSet.AddressSet) private tokensByLauncher;

    /// @notice Token address => bonding curve state.
    mapping(address => BondingCurve) public bondingCurvesByToken;

    /// @dev Set of all launched token addresses.
    EnumerableSet.AddressSet private launchedTokens;

    // --- Constructor ---

    /// @notice Deploy the WaifuFunV2 engine.
    /// @param _waifuToken     Address of the WAIFU ERC-20 token.
    /// @param _feeRouter      Address of the FeeRouter contract.
    /// @param _pancakeRouter  Address of PancakeSwap V2 Router.
    /// @param _config         Initial global configuration.
    constructor(
        address _waifuToken,
        address _feeRouter,
        address _pancakeRouter,
        ConfigParams memory _config
    ) {
        require(_waifuToken != address(0), "INVALID_WAIFU_TOKEN");
        require(_feeRouter != address(0), "INVALID_FEE_ROUTER");
        require(_pancakeRouter != address(0), "INVALID_PANCAKE_ROUTER");

        waifuToken = IERC20(_waifuToken);
        feeRouter = _feeRouter;
        pancakeRouter = IUniswapV2Router02(_pancakeRouter);
        pancakeFactory = IUniswapV2Factory(
            IUniswapV2Router02(_pancakeRouter).factory()
        );

        _validateConfig(_config);
        globalConfig = _config;
    }

    // --- Admin ---

    /// @notice Update the token factory address.
    /// @param _factory New factory address.
    function updateFactory(address _factory) external onlyOwner {
        require(_factory != address(0), "INVALID_FACTORY");
        factory = IWaifuFunTokenFactory(_factory);
        emit TokenFactoryUpdated(_factory);
    }

    /// @notice Update global configuration.
    /// @param _newConfig New config parameters.
    function updateGlobalConfig(ConfigParams memory _newConfig) external onlyOwner {
        _validateConfig(_newConfig);
        globalConfig = _newConfig;
    }

    // --- Public Entry Points ---

    /// @notice Launch a new agent token with a bonding curve.
    /// @param _params Launch parameters including supply split recipients.
    /// @return tokenAddress The deployed agent token address.
    function launch(
        LaunchParams memory _params
    ) external nonReentrant returns (address tokenAddress) {
        tokenAddress = _launch(_params);
    }

    /// @notice Swap WAIFU for agent tokens (buy) or agent tokens for WAIFU (sell).
    /// @param _param Swap parameters.
    function swap(SwapParameter memory _param) external nonReentrant {
        _swap(_param);
    }

    /// @notice Launch a new token and immediately buy into it.
    /// @param _launchParams  Launch parameters.
    /// @param _swapParam     Swap parameters (token field is overwritten).
    function launchAndSwap(
        LaunchParams memory _launchParams,
        SwapParameter memory _swapParam
    ) external nonReentrant {
        address tokenAddress = _launch(_launchParams);
        _swapParam.token = tokenAddress;
        _swap(_swapParam);
    }

    // --- View Functions ---

    /// @notice Get all tokens launched by a specific address.
    function getLaunchedTokensByOwner(
        address _launcher
    ) external view returns (address[] memory) {
        return tokensByLauncher[_launcher].values();
    }

    /// @notice Get all launched tokens.
    function getAllLaunchedTokens() external view returns (address[] memory) {
        return launchedTokens.values();
    }

    /// @notice Get full bonding curve state for a token.
    function getBondingCurve(
        address _token
    ) external view returns (BondingCurve memory) {
        return bondingCurvesByToken[_token];
    }

    /// @notice Preview the output amount for a swap without executing it.
    /// @param _token     Agent token address.
    /// @param _amountIn  Input amount.
    /// @param _direction 0 = buy, 1 = sell.
    /// @return amountOut  The output amount after fees.
    /// @return feeAmount  The fee deducted.
    function getAmountOut(
        address _token,
        uint256 _amountIn,
        uint8 _direction
    ) external view returns (uint256 amountOut, uint256 feeAmount) {
        (, amountOut, feeAmount) = _getAmountOut(_token, _amountIn, _direction);
    }

    // --- Internal: Launch ---

    function _launch(LaunchParams memory _params) internal returns (address) {
        require(address(factory) != address(0), "TOKEN_FACTORY_NOT_SET");
        require(_params.agentTreasury != address(0), "INVALID_AGENT_TREASURY");
        require(_params.creator != address(0), "INVALID_CREATOR");

        _validateAmount(
            _params.totalSupply,
            _params.virtualReserveWAIFU,
            _params.decimals
        );

        address launcher = msg.sender;

        // Deploy the agent token via factory
        address deployedToken = factory.deployToken(
            _params.name,
            _params.symbol,
            _params.totalSupply,
            _params.decimals
        );

        tokensByLauncher[launcher].add(deployedToken);
        launchedTokens.add(deployedToken);

        // Calculate supply split: 80% curve, 10% treasury, 10% creator
        uint256 curveAmount = (_params.totalSupply * CURVE_SUPPLY_RATE) / SUPPLY_FIXED_POINT;
        uint256 treasuryAmount = (_params.totalSupply * TREASURY_SUPPLY_RATE) / SUPPLY_FIXED_POINT;
        uint256 creatorAmount = _params.totalSupply - curveAmount - treasuryAmount;

        // Initialize bonding curve state
        bondingCurvesByToken[deployedToken] = BondingCurve({
            token: deployedToken,
            creator: launcher,
            initReserveWAIFU: _params.virtualReserveWAIFU,
            reserveTokenAmount: curveAmount,
            reserveWAIFU: _params.virtualReserveWAIFU,
            curveLimit: globalConfig.curveLimit,
            isCompleted: false
        });

        // Mint supply splits
        IWaifuFunToken(deployedToken).mintToken(address(this), curveAmount);
        IWaifuFunToken(deployedToken).mintToken(_params.agentTreasury, treasuryAmount);
        IWaifuFunToken(deployedToken).mintToken(_params.creator, creatorAmount);

        emit TokenLaunched(
            deployedToken,
            launcher,
            _params.totalSupply,
            _params.virtualReserveWAIFU,
            _params.decimals,
            _params.name,
            _params.symbol,
            _params.agentTreasury
        );

        return deployedToken;
    }

    // --- Internal: Swap ---

    function _swap(SwapParameter memory _param) internal {
        require(launchedTokens.contains(_param.token), "TOKEN_NOT_LAUNCHED");
        BondingCurve storage bondingCurve = bondingCurvesByToken[_param.token];
        require(!bondingCurve.isCompleted, "CURVE_ALREADY_COMPLETED");
        require(_param.amountIn > 0, "INVALID_AMOUNT_IN");
        require(block.timestamp < _param.deadline, "INSTRUCTION_EXPIRED");

        address sender = msg.sender;

        // Adjust amounts if buy would exceed curve limit
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

        // Calculate output via constant-product formula
        (
            uint256 adjustedAmount,
            uint256 amountOut,
            uint256 feeAmount
        ) = _getAmountOut(_param.token, amountToSwap, _param.direction);

        require(amountOut > 0, "INSUFFICIENT_OUTPUT_AMOUNT");
        require(amountOut >= adjustedMinAmountOut, "BELOW_MIN_AMOUNT_OUT");

        // Update reserves
        uint256 newReserveWAIFU;
        uint256 newReserveToken;

        if (_param.direction == 0) {
            // Buy: WAIFU in, agent token out
            newReserveWAIFU = bondingCurve.reserveWAIFU + adjustedAmount;
            newReserveToken = bondingCurve.reserveTokenAmount - amountOut;
        } else {
            // Sell: agent token in, WAIFU out
            newReserveWAIFU = bondingCurve.reserveWAIFU - amountOut;
            newReserveToken = bondingCurve.reserveTokenAmount + adjustedAmount;
        }

        bool isCompleted = _updateReserve(
            _param.token,
            newReserveToken,
            newReserveWAIFU
        );

        if (isCompleted || refundAmount > 0) {
            bondingCurve.isCompleted = true;
            emit BondingCurveCompleted(_param.token, sender);
        }

        // Execute transfers
        if (_param.direction == 0) {
            // Buy: pull WAIFU from sender, send agent tokens out.
            // Only pull the capped amountToSwap (not full amountIn).
            // Unlike ETH, excess stays in user wallet, no refund needed.
            waifuToken.safeTransferFrom(sender, address(this), amountToSwap);

            // Route fee to FeeRouter
            if (feeAmount > 0) {
                waifuToken.safeTransfer(feeRouter, feeAmount);
            }

            // Send agent tokens to buyer
            IERC20(_param.token).safeTransfer(sender, amountOut);
        } else {
            // Sell: pull agent tokens from sender, send WAIFU out
            IERC20(_param.token).safeTransferFrom(sender, address(this), amountToSwap);

            // Fee is taken from the input agent tokens, route to FeeRouter
            if (feeAmount > 0) {
                IERC20(_param.token).safeTransfer(feeRouter, feeAmount);
            }

            // Send WAIFU to seller
            waifuToken.safeTransfer(sender, amountOut);
        }

        emit SwapExecuted(
            sender,
            _param.token,
            amountToSwap,
            amountOut,
            feeAmount,
            _param.direction
        );

        // Auto-graduate if curve is complete
        if (bondingCurve.isCompleted) {
            _graduate(_param.token);
        }
    }

    // --- Internal: Graduation ---

    /// @dev Graduates the bonding curve to PancakeSwap V2.
    ///      Seeds liquidity with the real WAIFU reserve (excluding virtual)
    ///      and remaining agent tokens, then burns LP tokens to dead address.
    function _graduate(address _token) internal {
        BondingCurve storage curve = bondingCurvesByToken[_token];

        // Real WAIFU balance = current reserve minus virtual initial reserve
        uint256 waifuForLP = curve.reserveWAIFU - curve.initReserveWAIFU;
        uint256 tokenForLP = curve.reserveTokenAmount;

        // Zero out reserves (curve is done)
        curve.reserveWAIFU = 0;
        curve.reserveTokenAmount = 0;

        require(waifuForLP > 0, "NO_WAIFU_FOR_LP");

        // Approve PancakeSwap Router to spend both tokens
        waifuToken.safeApprove(address(pancakeRouter), waifuForLP);
        IERC20(_token).safeApprove(address(pancakeRouter), tokenForLP);

        // Add liquidity to PancakeSwap V2
        (uint256 amountWAIFU, uint256 amountToken, ) = pancakeRouter.addLiquidity(
            address(waifuToken),
            _token,
            waifuForLP,
            tokenForLP,
            (waifuForLP * 95) / 100,
            (tokenForLP * 95) / 100,
            address(this),
            block.timestamp + 300
        );

        // Get the pair address
        address pair = pancakeFactory.getPair(address(waifuToken), _token);

        // Burn LP tokens by sending to dead address
        uint256 lpBalance = IERC20(pair).balanceOf(address(this));
        require(lpBalance > 0, "NO_LP_TOKENS");
        IERC20(pair).safeTransfer(DEAD_ADDRESS, lpBalance);

        emit CurveGraduated(_token, pair, amountWAIFU, amountToken);
        emit LPLocked(_token, pair, lpBalance);

        // Reset approvals to zero for safety
        waifuToken.safeApprove(address(pancakeRouter), 0);
        IERC20(_token).safeApprove(address(pancakeRouter), 0);
    }

    // --- Internal: AMM Math ---

    /// @dev Adjusts input amounts if a buy would exceed the curve limit.
    ///      For ERC-20 base tokens, excess stays in user wallet (no refund transfer).
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
        BondingCurve memory curve = bondingCurvesByToken[_token];

        if (_direction == 0) {
            // Buy: WAIFU -> Token
            require(curve.reserveWAIFU < curve.curveLimit, "CURVE_ALREADY_COMPLETED");

            uint256 remainAmount = curve.curveLimit - curve.reserveWAIFU;

            if (_amountIn > remainAmount) {
                adjustedMinAmountOut = (_minAmountOut * remainAmount) / _amountIn;
                amountToSwap = remainAmount;
                refundAmount = _amountIn - remainAmount;
            } else {
                amountToSwap = _amountIn;
                refundAmount = 0;
                adjustedMinAmountOut = _minAmountOut;
            }
        } else {
            // Sell: no cap needed
            amountToSwap = _amountIn;
            refundAmount = 0;
            adjustedMinAmountOut = _minAmountOut;
        }
    }

    /// @dev Constant-product AMM: dy = y * dx / (x + dx)
    /// @param _token     Agent token address.
    /// @param _amount    Input amount.
    /// @param _direction 0 = buy (WAIFU -> token), 1 = sell (token -> WAIFU).
    /// @return adjustedAmount  Input after fee deduction.
    /// @return amountOut       Output amount.
    /// @return feeAmount       Fee deducted from input.
    function _getAmountOut(
        address _token,
        uint256 _amount,
        uint8 _direction
    ) internal view returns (uint256 adjustedAmount, uint256 amountOut, uint256 feeAmount) {
        BondingCurve memory curve = bondingCurvesByToken[_token];

        uint256 feeBasisPoints = _direction == 0
            ? globalConfig.buyFee
            : globalConfig.sellFee;

        feeAmount = (_amount * feeBasisPoints) / FEE_FIXED_POINT;
        adjustedAmount = _amount - feeAmount;

        if (_direction == 0) {
            // Buy: WAIFU in, agent tokens out
            uint256 numerator = curve.reserveTokenAmount * adjustedAmount;
            uint256 denominator = curve.reserveWAIFU + adjustedAmount;
            amountOut = numerator / denominator;
        } else {
            // Sell: agent tokens in, WAIFU out
            uint256 numerator = curve.reserveWAIFU * adjustedAmount;
            uint256 denominator = curve.reserveTokenAmount + adjustedAmount;
            amountOut = numerator / denominator;
        }
    }

    /// @dev Update reserves and check if curve limit is reached.
    function _updateReserve(
        address _token,
        uint256 _reserveToken,
        uint256 _reserveWAIFU
    ) internal returns (bool) {
        BondingCurve storage curve = bondingCurvesByToken[_token];
        curve.reserveWAIFU = _reserveWAIFU;
        curve.reserveTokenAmount = _reserveToken;
        return curve.reserveWAIFU >= curve.curveLimit;
    }

    // --- Internal: Validation ---

    function _validateAmount(
        uint256 _totalSupply,
        uint256 _reserveWAIFU,
        uint8 _decimals
    ) internal view {
        require(
            _decimals >= globalConfig.minDecimal && _decimals <= globalConfig.maxDecimal,
            "INVALID_DECIMAL"
        );

        uint256 tokenDecimal = 10 ** _decimals;
        require(_totalSupply % tokenDecimal == 0, "INVALID_TOTAL_SUPPLY_BY_DECIMAL");

        uint256 totalSupplyExcludeDecimal = _totalSupply / tokenDecimal;
        require(
            totalSupplyExcludeDecimal >= globalConfig.minTotalSupply &&
                totalSupplyExcludeDecimal <= globalConfig.maxTotalSupply,
            "INVALID_TOTAL_SUPPLY"
        );

        require(
            _reserveWAIFU >= globalConfig.minWAIFUAmount &&
                _reserveWAIFU <= globalConfig.maxWAIFUAmount,
            "INVALID_RESERVE_WAIFU_AMOUNT"
        );
        require(_reserveWAIFU < globalConfig.curveLimit, "RESERVE_EXCEEDS_CURVE_LIMIT");
    }

    function _validateConfig(ConfigParams memory _config) internal pure {
        require(
            _config.buyFee <= FEE_FIXED_POINT && _config.sellFee <= FEE_FIXED_POINT,
            "INVALID_FEE"
        );
        require(_config.curveLimit > 0, "INVALID_CURVE_LIMIT");
        require(
            _config.minWAIFUAmount <= _config.maxWAIFUAmount,
            "INVALID_WAIFU_RANGE"
        );
        require(
            _config.curveLimit > _config.minWAIFUAmount,
            "INVALID_CURVE_LIMIT_VS_MIN"
        );
        require(
            _config.minTotalSupply <= _config.maxTotalSupply,
            "INVALID_TOTAL_SUPPLY_RANGE"
        );
        require(
            _config.minDecimal <= _config.maxDecimal,
            "INVALID_DECIMAL_RANGE"
        );
    }
}
