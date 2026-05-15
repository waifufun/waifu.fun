/**
 * Constructor args for LaunchFactory at 0x18BFb4Bee9b2E910a5adcAc51d5977A0f4Be0983
 * (BSC mainnet, deployed 2026-05-14T19:50:43Z by 0xC9846a839c4e1D9050Dc890A25661AB13224e9EC)
 *
 * Source: packages/contracts-evm/deployments/bsc-mainnet.json
 *
 * Used by: npx hardhat verify --constructor-args scripts/verify/launch-factory-args.js \
 *            --network bscMainnet 0x18BFb4Bee9b2E910a5adcAc51d5977A0f4Be0983
 */
module.exports = [
	"0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // wbnb
	"0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73", // pcsFactory
	"0x10ED43C718714eb63d5aA57B78B54704E256024E", // pcsRouter
	"0x2f7f413fcc6c3812c665c15bd4a012e663f567d626112a81d401066fd5a771b4", // initCodeHash
	"0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0", // flapPortal
	"0x024f18294970B5c76c0691b87f138A0317156422", // tokenImplTaxedV3
	"0x4848489f0b2BEdd788c696e2D79b6b69D7484848", // tipReceiver (48 Club builder)
];
