import * as dotenv from "dotenv";

dotenv.config();

export function getRpcUrl() {
	const network = process.env.NETWORK || "devnet";
	if (network === "mainnet") {
		if (process.env.HELIUS_API_KEY) {
			return `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
		}
		return "https://api.mainnet-beta.solana.com";
	}

	if (process.env.HELIUS_API_KEY) {
		return `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
	}
	return "https://api.devnet.solana.com";
}
