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

export const elizaCloudCircuitBreakerState = new Gauge({
	name: "eliza_cloud_circuit_breaker_state",
	help: "Eliza Cloud circuit breaker state per circuit: 0=closed, 1=open, 2=half-open.",
	labelNames: ["circuit"] as const,
	registers: [metricsRegistry],
});

export const elizaCloudOutstandingRequests = new Gauge({
	name: "eliza_cloud_outstanding_requests",
	help: "In-flight Eliza Cloud requests by static operation name.",
	labelNames: ["operation"] as const,
	registers: [metricsRegistry],
});
