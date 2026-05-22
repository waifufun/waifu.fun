import { apiFetch } from "./_fetcher";

export type BurnSnapshot = {
	agentTokenAddress: string;
	generatedAt: number;
	burn24hBnb: number;
	burn24hUsd: number | null;
	burn7dBnb: number;
	burn7dUsd: number | null;
	runwayDays: number | null;
	source: "ankr" | "bscscan" | "rpc-direct";
	byWallet: Array<{ walletId: string; address: string; outflow24hBnb: number; outflow7dBnb: number }>;
};

type ApiEnvelope<T> = { ok?: boolean; data?: T };

export async function fetchAgentBurnRate(address: string): Promise<BurnSnapshot> {
	const response = await apiFetch<ApiEnvelope<BurnSnapshot> | BurnSnapshot>(
		`/v2/agents/${encodeURIComponent(address)}/burn-rate`,
	);
	if (response && typeof response === "object" && "data" in response && response.data) return response.data;
	return response as BurnSnapshot;
}
