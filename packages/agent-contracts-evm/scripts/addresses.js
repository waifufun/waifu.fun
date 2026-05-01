// Safe + Zodiac deployment references used by AgentSafeFactory deploy scripts.
// This file is a deploy-path registry only; W1.10 does not live-deploy anything.
// Verify all BSC mainnet addresses against upstream before an ops deploy:
// - Safe deployments: https://github.com/safe-global/safe-deployments
// - Zodiac Roles Modifier: https://github.com/gnosisguild/zodiac-modifier-roles

const addresses = {
	bscMainnet: {
		chainId: 56,
		safeSingleton: "0x41675C099F32341bf84BFc5382aF534df5C7461a",
		safeProxyFactory: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
		safeFallbackHandler: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99",
		// TODO verify before mainnet against Zodiac Roles Modifier v1 deployments.
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

module.exports = { addresses };
