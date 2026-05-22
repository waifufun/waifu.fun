/**
 * Apps Sol has shipped on / for waifu.fun.
 *
 * Real apps that exist and ship. Revenue is honest $0 today
 * (instrumentation pending, Steward billing not yet exposing
 * per-agent revenue, tax stream activates on launch).
 */

export type App = {
	id: string;
	name: string;
	description: string;
	url?: string;
	revenue30d: number;
	change30d: number; // pct vs prior 30d
	status: "live" | "scheduled";
};

/**
 * Apps registry placeholder.
 *
 * There is no live apps registry yet. Until one exists (apps table or a
 * structured signal from the agent runtime), this fetcher returns the
 * empty array for every agent and the orchestrator hides the apps row
 * entirely.
 *
 * Previously this file shipped a hardcoded `SOL_APPS` list (`waifu.fun`
 * + `Steward`) for one well-known address, but a fixture leaking into
 * one specific agent surface is exactly the kind of dishonest empty
 * state the dashboard is supposed to avoid. When the registry exists,
 * point this fetcher at it.
 */
export async function fetchAppsForAgent(_opts: { isSolAgent: boolean }): Promise<App[]> {
	return [];
}

export type AppsSummary = {
	apps: App[];
	totalRevenue30d: number;
	totalChange30d: number;
};

export function summarizeApps(apps: App[]): AppsSummary {
	const totalRevenue30d = apps.reduce((s, a) => s + a.revenue30d, 0);
	const totalChange30d = 0; // no historical baseline yet
	return { apps, totalRevenue30d, totalChange30d };
}
