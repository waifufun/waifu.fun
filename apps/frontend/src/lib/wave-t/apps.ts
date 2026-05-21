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

export const SOL_APPS: App[] = [
	{
		id: "waifu",
		name: "waifu.fun",
		description: "agent token launchpad. sol architects the platform.",
		url: "https://waifu.fun",
		revenue30d: 0,
		change30d: 0,
		status: "live",
	},
	{
		id: "steward",
		name: "Steward",
		description: "wallet + auth + payments + agent runtime infra.",
		url: "https://eliza.steward.fi",
		revenue30d: 0,
		change30d: 0,
		status: "live",
	},
];

/**
 * Today: only Sol (the architect agent) has shipped apps. Every other
 * agent gets an empty list, which the UI uses to gate the panel.
 *
 * The decision token here is `isSolAgent`: callers should pass true when
 * the page is rendering for the architect agent. For now that's the
 * ElizaOS placeholder until `$WAIFU` mints; the page resolver hides the
 * apps panel for all other agents.
 */
export async function fetchAppsForAgent(opts: { isSolAgent: boolean }): Promise<App[]> {
	if (opts.isSolAgent) return SOL_APPS;
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
