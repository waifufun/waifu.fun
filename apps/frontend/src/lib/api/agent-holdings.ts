import { apiFetch } from "@/lib/api/_fetcher";
import type { NavSnapshot } from "@waifufun/types";

type AgentHoldingsResponse = {
	ok: true;
	data: NavSnapshot;
};

export type { Holding, NavSnapshot } from "@waifufun/types";

export async function fetchAgentHoldings(address: string): Promise<NavSnapshot> {
	const response = await apiFetch<AgentHoldingsResponse>(`/v2/agents/${encodeURIComponent(address)}/holdings`);
	return response.data;
}
