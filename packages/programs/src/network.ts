export type Network = "mainnet" | "devnet";

export function getNetwork(): Network {
	const network = process.env.NETWORK || process.env.NEXT_PUBLIC_NETWORK;

	if (network === "devnet" || network === "testnet") {
		return "devnet";
	}

	return "mainnet";
}

export function isMainnet(): boolean {
	return getNetwork() === "mainnet";
}

export function isDevnet(): boolean {
	return getNetwork() === "devnet";
}

export function getNetworkString(): string {
	return getNetwork();
}
