// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILaunchVaultRouterCallbacks {
    function pullBnbForLaunch(uint256 amount) external;
    function distribute(address token, uint256 presalerShare) external;
}
