/**
 * Frontend localnet detection utility
 * Determines if the application is running on localnet to skip external APIs
 */

export function isLocalnet(): boolean {
	// Check if we're running on localnet based on environment variables
	const jejuNetwork = process.env.NEXT_PUBLIC_JEJU_NETWORK;
	const jejuRpcUrl = process.env.NEXT_PUBLIC_JEJU_RPC_URL;

	// Explicit localnet environment
	if (jejuNetwork === "localnet") {
		return true;
	}

	// Check if RPC URL points to localhost
	if (jejuRpcUrl?.includes("localhost") || jejuRpcUrl?.includes("127.0.0.1")) {
		return true;
	}

	// Check if no external API keys are configured
	const hasHelius = !!process.env.NEXT_PUBLIC_HELIUS_API_KEY;
	const hasAlchemy = !!process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

	// If no external API keys and NODE_ENV is development, assume localnet
	if (!hasHelius && !hasAlchemy && process.env.NODE_ENV === "development") {
		return true;
	}

	return false;
}

export function shouldSkipExternalAPIs(): boolean {
	return isLocalnet();
}

export function getDefaultRpcUrl(): string {
	if (isLocalnet()) {
		return process.env.NEXT_PUBLIC_JEJU_RPC_URL || "http://127.0.0.1:9545";
	}
	return "https://rpc.jeju.network";
}

