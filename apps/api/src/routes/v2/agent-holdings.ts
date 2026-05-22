import type { Database } from "@waifufun/db";
import { Hono } from "hono";
import type { Context } from "hono";
import { AgentNotFoundError, type NavAggregatorDeps, buildNavSnapshot } from "../../services/nav/aggregator.js";

const app = new Hono();
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const CACHE_CONTROL = "public, max-age=30, stale-while-revalidate=60";

type AgentHoldingsDepsForTest = NavAggregatorDeps & { db?: Database };
const agentHoldingsDepsForTest: AgentHoldingsDepsForTest = {};

export function __setAgentHoldingsRoutesDepsForTest(deps: Partial<AgentHoldingsDepsForTest>): void {
	for (const key of Object.keys(agentHoldingsDepsForTest) as Array<keyof AgentHoldingsDepsForTest>)
		delete agentHoldingsDepsForTest[key];
	Object.assign(agentHoldingsDepsForTest, deps);
}

function invalidAddress(c: Context) {
	return c.json({ ok: false, error: "INVALID_ADDRESS", message: "invalid agent token address" }, 400);
}

app.get("/:address/holdings", async (c) => {
	const address = c.req.param("address").toLowerCase();
	if (!ADDRESS_RE.test(address)) return invalidAddress(c);
	try {
		const snapshot = await buildNavSnapshot(address, agentHoldingsDepsForTest);
		c.header("Cache-Control", CACHE_CONTROL);
		if (snapshot.stale.length > 0) c.header("X-Sources-Stale", snapshot.stale.map((item) => item.source).join(","));
		return c.json({ ok: true, data: snapshot });
	} catch (err) {
		if (err instanceof AgentNotFoundError)
			return c.json({ ok: false, error: "AGENT_NOT_FOUND", message: "agent not found" }, 404);
		if (err instanceof Error && err.message === "database unavailable") {
			return c.json({ ok: false, error: "DATABASE_UNAVAILABLE", message: "database unavailable" }, 503);
		}
		return c.json(
			{ ok: false, error: "FAILED_TO_LOAD_AGENT_HOLDINGS", detail: err instanceof Error ? err.message : String(err) },
			500,
		);
	}
});

export default app;
