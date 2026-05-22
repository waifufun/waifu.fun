/**
 * Server-safe fetcher for `/v2/agents/:address/apps`.
 *
 * The apps registry is the honest source of truth for mini-apps an agent has
 * registered, plus the revenue counters Steward billing rails can populate.
 * Empty responses are valid: the UI should render the no-apps empty state,
 * not invent fixtures.
 */

export type AppStatus = "live" | "paused" | "scheduled";

export type App = {
	id: string;
	agentTokenAddress: string;
	appId: string;
	name: string;
	description: string | null;
	icon: string | null;
	appUrl: string | null;
	status: AppStatus;
	shippedAt: string | null;
	revenueLifetimeUsd: number;
	revenue24hUsd: number;
	revenue7dUsd: number;
	revenue7dDeltaPct: number | null;
	metadata: unknown;
	createdAt: string;
	updatedAt: string;
};

export type AgentAppsResponse = {
	ok: true;
	data: {
		apps: App[];
		totalRevenue7d: number;
		totalLifetime: number;
	};
};

function serverApiBase(): string {
	const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
	if (configured?.startsWith("http://") || configured?.startsWith("https://")) {
		return configured.replace(/\/+$/, "");
	}
	if (process.env.NODE_ENV !== "production") {
		return "http://localhost:3100";
	}
	return "https://api.waifu.fun";
}

function toNumber(value: unknown): number {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeApp(raw: unknown): App | null {
	if (!raw || typeof raw !== "object") return null;
	const row = raw as Record<string, unknown>;
	const appId = typeof row.appId === "string" ? row.appId : "";
	const name = typeof row.name === "string" ? row.name : "";
	if (!appId || !name) return null;
	const status =
		row.status === "live" || row.status === "paused" || row.status === "scheduled" ? row.status : "scheduled";
	return {
		id: typeof row.id === "string" ? row.id : appId,
		agentTokenAddress: typeof row.agentTokenAddress === "string" ? row.agentTokenAddress : "",
		appId,
		name,
		description: typeof row.description === "string" ? row.description : null,
		icon: typeof row.icon === "string" ? row.icon : null,
		appUrl: typeof row.appUrl === "string" ? row.appUrl : null,
		status,
		shippedAt: typeof row.shippedAt === "string" ? row.shippedAt : null,
		revenueLifetimeUsd: toNumber(row.revenueLifetimeUsd),
		revenue24hUsd: toNumber(row.revenue24hUsd),
		revenue7dUsd: toNumber(row.revenue7dUsd),
		revenue7dDeltaPct:
			row.revenue7dDeltaPct === null || row.revenue7dDeltaPct === undefined ? null : toNumber(row.revenue7dDeltaPct),
		metadata: row.metadata ?? null,
		createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
		updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
	};
}

export async function fetchAppsForAgent(address: string): Promise<App[]> {
	const base = serverApiBase();
	try {
		const res = await fetch(`${base}/v2/agents/${encodeURIComponent(address)}/apps`, {
			next: { revalidate: 60 },
		});
		if (!res.ok) return [];
		const json = (await res.json()) as unknown;
		const data = json && typeof json === "object" && "data" in json ? (json as AgentAppsResponse).data : null;
		if (!data || !Array.isArray(data.apps)) return [];
		return data.apps.map(normalizeApp).filter((app): app is App => app !== null);
	} catch {
		return [];
	}
}

export type AppsSummary = {
	apps: App[];
	totalRevenue7d: number;
	totalLifetime: number;
};

export function summarizeApps(apps: App[]): AppsSummary {
	return {
		apps,
		totalRevenue7d: apps.reduce((sum, app) => sum + app.revenue7dUsd, 0),
		totalLifetime: apps.reduce((sum, app) => sum + app.revenueLifetimeUsd, 0),
	};
}
