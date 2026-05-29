/**
 * Apps directory aggregator (server-only).
 *
 * There is no global `/v2/apps` endpoint yet, only the per-agent registry
 * `/v2/agents/:address/apps`. So the directory fans out: it pulls a page of
 * agents from `/v2/agents`, fetches each agent's app registry in parallel,
 * and joins the agent identity (name / ticker / image) onto every app row.
 *
 * Everything here is data-driven. If the registry is empty (likely while the
 * first real apps are still being built) the result is an empty array and the
 * page renders the honest wave-t empty state instead of inventing fixtures.
 *
 * When a real global apps endpoint lands, swap `fetchAppsDirectory` to read it
 * directly. The `DirectoryApp` shape (in `apps-directory-types.ts`) is the
 * contract the UI depends on.
 */

import { fetchAgents } from "@/lib/agents-api";
import type { App } from "@/lib/wave-t/apps";
import { fetchAppsForAgent } from "@/lib/wave-t/apps";
import { type AppsDirectory, type DirectoryApp, appMeta } from "@/lib/wave-t/apps-directory-types";

export type { AppsDirectory, DirectoryApp } from "@/lib/wave-t/apps-directory-types";
export { appMeta, appPricePerUseUsd } from "@/lib/wave-t/apps-directory-types";

/**
 * Aggregate apps across agents. Scans up to `agentLimit` agents (newest first
 * is fine for now; the page sorts by featured + revenue afterwards).
 */
export async function fetchAppsDirectory(agentLimit = 60): Promise<AppsDirectory> {
	let agents: Awaited<ReturnType<typeof fetchAgents>>["agents"] = [];
	try {
		const res = await fetchAgents({ limit: agentLimit, offset: 0, sort: "newest" });
		agents = res.agents.filter((a) => a.tokenAddress);
	} catch {
		agents = [];
	}

	if (agents.length === 0) {
		return { apps: [], agentsScanned: 0, liveCount: 0, totalRevenue7d: 0, totalLifetime: 0 };
	}

	const settled = await Promise.allSettled(
		agents.map(async (agent) => {
			const apps = await fetchAppsForAgent(agent.tokenAddress);
			return apps.map<DirectoryApp>((app) => ({
				...app,
				agent: {
					address: agent.tokenAddress,
					name: agent.name,
					ticker: agent.ticker,
					image: agent.image ?? null,
				},
			}));
		}),
	);

	const apps: DirectoryApp[] = [];
	for (const r of settled) {
		if (r.status === "fulfilled") apps.push(...r.value);
	}

	// Sort: featured first, then live before paused/scheduled, then by 7d revenue.
	const statusRank: Record<App["status"], number> = { live: 0, paused: 1, scheduled: 2 };
	apps.sort((a, b) => {
		const fa = appMeta(a).featured ? 0 : 1;
		const fb = appMeta(b).featured ? 0 : 1;
		if (fa !== fb) return fa - fb;
		if (statusRank[a.status] !== statusRank[b.status]) return statusRank[a.status] - statusRank[b.status];
		return b.revenue7dUsd - a.revenue7dUsd;
	});

	return {
		apps,
		agentsScanned: agents.length,
		liveCount: apps.filter((a) => a.status === "live").length,
		totalRevenue7d: apps.reduce((s, a) => s + a.revenue7dUsd, 0),
		totalLifetime: apps.reduce((s, a) => s + a.revenueLifetimeUsd, 0),
	};
}
