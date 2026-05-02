import { Counter, Gauge } from "prom-client";

import { metricsRegistry } from "./registry.js";

export const agentEventsTotal = new Counter({
	name: "agent_events_total",
	help: "Total agent events emitted by service, agent, and event type.",
	labelNames: ["service", "agentId", "eventType"] as const,
	registers: [metricsRegistry],
});

export const agentActionsTotal = new Counter({
	name: "agent_actions_total",
	help: "Total agent adapter actions emitted by service, agent, adapter, and action.",
	labelNames: ["service", "agentId", "adapter", "action"] as const,
	registers: [metricsRegistry],
});

export const agentXPostsTotal = new Counter({
	name: "agent_x_posts_total",
	help: "Total X posts published per agent.",
	labelNames: ["agentId"] as const,
	registers: [metricsRegistry],
});

export const agentInferenceCostUsdTotal = new Counter({
	name: "agent_inference_cost_usd_total",
	help: "Total agent inference spend in USD.",
	labelNames: ["agentId"] as const,
	registers: [metricsRegistry],
});

export const agentTreasuryUsd = new Gauge({
	name: "agent_treasury_usd",
	help: "Latest observed treasury value in USD per agent.",
	labelNames: ["agentId"] as const,
	registers: [metricsRegistry],
});

export const agentDailyBurnUsd = new Gauge({
	name: "agent_daily_burn_usd",
	help: "Latest estimated daily burn in USD per agent.",
	labelNames: ["agentId"] as const,
	registers: [metricsRegistry],
});

export const agentRunwayDays = new Gauge({
	name: "agent_runway_days",
	help: "Latest estimated runway in days per agent.",
	labelNames: ["agentId"] as const,
	registers: [metricsRegistry],
});
