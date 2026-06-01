import { AgentEventTypes } from "@waifufun/db";

import { handleAgentCreated } from "./agent-created.js";
import { handleAgentGraduated } from "./agent-graduated.js";
import { handleAgentTradeBuy } from "./agent-trade-buy.js";
import { handleAgentTradeSell } from "./agent-trade-sell.js";
import type { Handler } from "./types.js";
export type { Handler, HandlerArgs, HandlerContext, HandlerResult } from "./types.js";

/**
 * Map of canonical event types → handler functions. Unknown types are
 * caught in the worker and marked failed.
 */
export const handlers: Record<string, Handler> = {
	[AgentEventTypes.Created]: handleAgentCreated,
	[AgentEventTypes.TradeBuy]: handleAgentTradeBuy,
	[AgentEventTypes.TradeSell]: handleAgentTradeSell,
	[AgentEventTypes.Bonded]: handleAgentGraduated,
	[AgentEventTypes.Graduated]: handleAgentGraduated,
};

export function resolveHandler(type: string): Handler | null {
	return handlers[type] ?? null;
}
