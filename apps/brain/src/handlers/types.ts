import type { AgentEventRow, AgentPersonaRow } from "@waifufun/db";

import type { Logger } from "../lib/logger.js";
import type { TwitterClient } from "../twitter/client.js";

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
