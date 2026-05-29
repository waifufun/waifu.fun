/**
 * Apps directory data source (server-only adapter).
 *
 * DATA SOURCE STATUS (2026-05-29): the apps registry is LIVE and populated.
 * `GET /v2/agents/:address/apps` returns 200 from the waifu.fun monorepo
 * (which absorbed waifu-core and serves api.waifu.fun). Sol's agent already
 * ships 6 real apps (waifu + steward live, twitter-replies / trading-perps /
 * predictions / content scheduled), so this directory renders real data. The
 * revenue counters (`revenue7d/24h/lifetime`) exist on every row but read $0
 * until billing is wired (see EVENTUAL SOURCE); the page shows them honestly
 * rather than faking numbers.
 *
 * EVENTUAL SOURCE for revenue: the metered-apps / billing rail lives in the
 * separate Eliza Cloud monorepo (`api.elizacloud.ai`): a metered `/chat` +
 * `/generate-image` with app credits, creator markup, and an earnings ledger.
 * waifu integrates over the service-key API and the `agent_apps` registry is
 * the read-cache that the earnings pull writes back into. Until that pull is
 * wired the counters stay $0; nothing here fabricates them.
 *
 * ADAPTER SEAM: `fetchAppsDirectory` is the single seam. The UI depends only on
 * the `DirectoryApp` / `AppsDirectory` shape (in `apps-directory-types.ts`),
 * never on where the data came from. If a global `/v2/apps` endpoint or a
 * direct Eliza Cloud earnings feed lands later, replace the body here and map
 * the response into `DirectoryApp`. No UI change required.
 *
 * CURRENT ADAPTER: there is no global apps endpoint, so this fans out over the
 * per-agent registry: pull a page of agents from `/v2/agents`, fetch each
 * agent's app registry in parallel, join agent identity onto every row. Agents
 * with no apps contribute nothing; an agent with no reachable registry simply
 * drops out (`Promise.allSettled`), never crashing the page. If every agent is
 * empty the page falls back to the honest wave-t empty state, never fixtures.
 */

import { fetchAgents } from "@/lib/agents-api";
import type { App } from "@/lib/wave-t/apps";
import { fetchAppsForAgent } from "@/lib/wave-t/apps";
import { type AppsDirectory, type DirectoryApp, appMeta } from "@/lib/wave-t/apps-directory-types";

export type { AppsDirectory, DirectoryApp } from "@/lib/wave-t/apps-directory-types";
export { appMeta, appPricePerUseUsd } from "@/lib/wave-t/apps-directory-types";

/** Empty directory: the honest default when the source is unreachable. */
function emptyDirectory(agentsScanned = 0): AppsDirectory {
	return { apps: [], agentsScanned, liveCount: 0, totalRevenue7d: 0, totalLifetime: 0 };
}

/**
 * Aggregate apps across agents (the current adapter; see file header).
 * Scans up to `agentLimit` agents (newest first is fine for now; the page
 * sorts by featured + revenue afterwards). Returns an empty directory on any
 * failure so the page never crashes or fabricates rows.
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
		return emptyDirectory(0);
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
