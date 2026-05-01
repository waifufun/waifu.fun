import type { AgentEventRow, AgentPersonaRow } from "@waifufun/db";
import { AgentEventTypes } from "@waifufun/db";

import type { Logger } from "../lib/logger.js";
import type { TwitterClient } from "../twitter/client.js";
import { handleAgentCreated } from "./agent-created.js";
import { handleAgentGraduated } from "./agent-graduated.js";
import { handleAgentTradeBuy } from "./agent-trade-buy.js";
import { handleAgentTradeSell } from "./agent-trade-sell.js";

export interface HandlerContext {
	logger: Logger;
	twitter: TwitterClient;
	anthropicApiKey: string | undefined;
}

export interface HandlerArgs {
	event: AgentEventRow;
	persona: AgentPersonaRow;
	ctx: HandlerContext;
}

export interface HandlerResult {
	ok: boolean;
	errorMessage?: string;
	/** The tweet text we ended up posting (or would have posted in dry-run). */
	tweet?: string;
	/** If we skipped on purpose (e.g. rate-limited), set this. */
	skipped?: boolean;
	skipReason?: string;
}

export type Handler = (args: HandlerArgs) => Promise<HandlerResult>;

/**
 * Map of canonical event types → handler functions. Unknown types are
 * caught in the worker and marked failed.
 */
export const handlers: Record<string, Handler> = {
	[AgentEventTypes.Created]: handleAgentCreated,
	[AgentEventTypes.TradeBuy]: handleAgentTradeBuy,
	[AgentEventTypes.TradeSell]: handleAgentTradeSell,
	[AgentEventTypes.Graduated]: handleAgentGraduated,
};

export function resolveHandler(type: string): Handler | null {
	return handlers[type] ?? null;
}
