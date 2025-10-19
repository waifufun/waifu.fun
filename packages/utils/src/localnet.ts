/**
 * Localnet detection utility
 * Determines if the application is running on localnet to skip external APIs
 */

export function isLocalnet(): boolean {
	// Check if we're running on localnet based on environment variables
	const jejuNetwork = process.env.JEJU_NETWORK || process.env.NEXT_PUBLIC_JEJU_NETWORK;
	const jejuRpcUrl = process.env.JEJU_RPC_URL || process.env.NEXT_PUBLIC_JEJU_RPC_URL;
	const nodeEnv = process.env.NODE_ENV;

	// Explicit localnet environment
	if (jejuNetwork === "localnet") {
		return true;
	}

	// Check if RPC URL points to localhost
	if (jejuRpcUrl?.includes("localhost") || jejuRpcUrl?.includes("127.0.0.1")) {
		return true;
	}

	// Development mode with no external API keys
	if (nodeEnv === "development") {
		const hasAlchemy = !!process.env.ALCHEMY_API_KEY || !!process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
		const hasHelius = !!process.env.HELIUS_API_KEY || !!process.env.NEXT_PUBLIC_HELIUS_API_KEY;
		const hasCodex = !!process.env.CODEX_API_KEY || !!process.env.NEXT_PUBLIC_CODEX_API_KEY;

		// If in dev mode with no external API keys, assume localnet
		if (!hasAlchemy && !hasHelius && !hasCodex) {
			return true;
		}
	}

	return false;
}

export function shouldSkipExternalAPIs(): boolean {
	return isLocalnet();
}

export function getDefaultRpcUrl(): string {
	if (isLocalnet()) {
		return process.env.JEJU_RPC_URL || process.env.NEXT_PUBLIC_JEJU_RPC_URL || "http://127.0.0.1:9545";
	}
	return "https://rpc.jeju.network";
}

