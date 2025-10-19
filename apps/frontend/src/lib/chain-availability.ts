import { EvmChainIds } from "@autofun/types";

export interface ChainAvailability {
	chainId: EvmChainIds;
	available: boolean;
	reason?: string;
}

/**
 * Validates that an environment variable is set and not empty
 * @param value - The environment variable value to validate
 * @returns true if valid, false if undefined/empty/whitespace-only
 */
function isValidEnvVar(value: string | undefined): boolean {
	return typeof value === "string" && value.trim().length > 0;
}

export function getAvailableEvmChains(): ChainAvailability[] {
	const isLocalnet = process.env.NODE_ENV === "development";
	const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
	const bscRpc = process.env.NEXT_PUBLIC_BSC_RPC_URL;

	return [
		// Jeju is always available
		{
			chainId: EvmChainIds.JejuMainnet, // 420691
			available: true,
		},
		{
			chainId: EvmChainIds.JejuTestnet, // 420690
			available: true,
		},
		{
			chainId: EvmChainIds.JejuLocalnet, // 1337
			available: isLocalnet,
			reason: isLocalnet ? undefined : "Only available in development",
		},
		// Ethereum requires Alchemy API key
		{
			chainId: EvmChainIds.EthereumMainnet,
			available: isValidEnvVar(alchemyKey),
			reason: isValidEnvVar(alchemyKey) ? undefined : "ALCHEMY_API_KEY not configured",
		},
		{
			chainId: EvmChainIds.EthereumSepolia,
			available: isValidEnvVar(alchemyKey),
			reason: isValidEnvVar(alchemyKey) ? undefined : "ALCHEMY_API_KEY not configured",
		},
		// Base requires Alchemy API key
		{
			chainId: EvmChainIds.BaseMainnet,
			available: isValidEnvVar(alchemyKey),
			reason: isValidEnvVar(alchemyKey) ? undefined : "ALCHEMY_API_KEY not configured",
		},
		{
			chainId: EvmChainIds.BaseSepolia,
			available: isValidEnvVar(alchemyKey),
			reason: isValidEnvVar(alchemyKey) ? undefined : "ALCHEMY_API_KEY not configured",
		},
		// BSC requires RPC URL
		{
			chainId: EvmChainIds.BSCMainnet,
			available: isValidEnvVar(bscRpc),
			reason: isValidEnvVar(bscRpc) ? undefined : "BSC_RPC_URL not configured",
		},
		{
			chainId: EvmChainIds.BSCTestnet,
			available: isValidEnvVar(bscRpc),
			reason: isValidEnvVar(bscRpc) ? undefined : "BSC_RPC_URL not configured",
		},
	];
}

export function shouldShowChain(chainId: EvmChainIds): boolean {
	const availability = getAvailableEvmChains();
	const chain = availability.find((c) => c.chainId === chainId);
	return chain?.available ?? false;
}

export function logChainAvailability(): void {
	if (process.env.NODE_ENV !== "development") return;

	const availability = getAvailableEvmChains();
	const unavailable = availability.filter((c) => !c.available);

	if (unavailable.length > 0) {
		console.group("ℹ️  Chain Availability");
		console.log("Optional chains are disabled (Jeju chains are always enabled):");
		for (const chain of unavailable) {
			console.log(`  • Chain ${chain.chainId}: ${chain.reason}`);
		}
		console.log("\nTo enable optional chains, add the required environment variables to .env");
		console.groupEnd();
	}
}
