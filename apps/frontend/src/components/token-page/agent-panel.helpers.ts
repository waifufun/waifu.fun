import type { IToken } from "@waifufun/types";

export type PublicAgentSnapshot = {
	hasAgent: boolean;
	status: string | null;
	lifecycle: string | null;
	canChat: boolean;
};

export function canAgentStatusChat(status: string | null | undefined): boolean {
	return (
		String(status ?? "")
			.trim()
			.toLowerCase() === "running"
	);
}

export function getPublicAgentSnapshot(token: IToken): PublicAgentSnapshot {
	const publicToken = token as IToken & {
		hasAgent?: boolean;
		agentStatus?: string;
		agentLifecycleState?: string;
		cloudAgentId?: string;
		webUiUrl?: string;
	};
	const rawStatus = String(publicToken.agentStatus ?? "")
		.trim()
		.toLowerCase();
	const rawLifecycle = String(publicToken.agentLifecycleState ?? "")
		.trim()
		.toLowerCase();

	let status = rawStatus && rawStatus !== "none" ? rawStatus : null;
	if (status === "suspended") status = "stopped";

	if (!status) {
		if (rawLifecycle === "birth" || rawLifecycle === "reviving") status = "provisioning";
		if (rawLifecycle === "live") status = "running";
		if (rawLifecycle === "dormant") status = "stopped";
	}

	const hasAgent = Boolean(
		publicToken.hasAgent || publicToken.cloudAgentId || publicToken.webUiUrl || status || rawLifecycle,
	);
	const publicStatus = hasAgent ? (status ?? "unknown") : null;
	return {
		hasAgent,
		status: publicStatus,
		lifecycle: rawLifecycle || null,
		canChat: canAgentStatusChat(publicStatus),
	};
}

export function tokenChatHref(token: IToken): string {
	return `/token/${encodeURIComponent(String(token.chain))}/${encodeURIComponent(String(token.chainId))}/${encodeURIComponent(
		token.contractAddress,
	)}/chat`;
}
