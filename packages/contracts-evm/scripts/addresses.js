/** PancakeSwap + infra addresses keyed by Hardhat network name. */
const pancakeSwap = {
	bscMainnet: {
		pancakeFactory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
		pancakeRouter: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
		WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
		DEAD: "0x000000000000000000000000000000000000dEaD",
	},
	bscTestnet: {
		pancakeFactory: "0x6725F303b657a9451d8BA641348b6761A6CC7a17",
		pancakeRouter: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1",
		WBNB: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
		DEAD: "0x000000000000000000000000000000000000dEaD",
	},
};

/** Safe + Zodiac deployment references for AgentSafeFactory deploy scripts. */
const agentSafe = {
	bscMainnet: {
		chainId: 56,
		safeSingleton: "0x41675C099F32341bf84BFc5382aF534df5C7461a",
		safeProxyFactory: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
		safeFallbackHandler: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99",
		rolesModifier: "0xC581c6ED4c9Dc6f78B44e0fBF8428A0D08060b0F",
	},
	bscTestnet: {
		chainId: 97,
		safeSingleton: "",
		safeProxyFactory: "",
		safeFallbackHandler: "",
		rolesModifier: "",
	},
};

module.exports = {
	...pancakeSwap,
	agentSafe,
};
