import { apiFetch } from "@/lib/api/_fetcher";

export type AgentWalletChain = "bsc" | "eth" | "arb" | "base" | "op" | "polygon" | "solana";
export type AgentWalletRole = "agent-safe" | "agent-hot" | "patron" | "venue-bridge";
export type AgentWalletOwnerType = "agent" | "patron" | "platform";

export type AgentWallet = {
	id: string;
	address: string;
	chain: AgentWalletChain;
	role: AgentWalletRole;
	venue: string | null;
	label: string;
	ownerType: AgentWalletOwnerType;
	addedAt: number;
};

type AgentWalletsResponse = {
	ok: true;
	data: {
		agentTokenAddress: string;
		wallets: AgentWallet[];
	};
};

export async function fetchAgentWallets(address: string): Promise<AgentWallet[]> {
	const response = await apiFetch<AgentWalletsResponse>(`/v2/agents/${encodeURIComponent(address)}/wallets`);
	return response.data.wallets;
}
