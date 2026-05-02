import type { PortalEvent } from "../lib/events.js";
import type { IndexerRuntime } from "../lib/runtime.js";
import { handleLaunchedToDexEvent } from "./launched-to-dex.js";
import { handleProgressChangedEvent } from "./progress-changed.js";
import { handleTokenBoughtEvent } from "./token-bought.js";
import { handleTokenCreatedEvent } from "./token-created.js";
import { handleTokenSoldEvent } from "./token-sold.js";

export interface PortalEventHandlerResult {
	handled: boolean;
	enqueuedJobs: string[];
}

export async function processPortalEvent(
	runtime: IndexerRuntime,
	event: PortalEvent,
): Promise<PortalEventHandlerResult> {
	switch (event.eventName) {
		case "TokenCreated":
			return handleTokenCreatedEvent(runtime, event);
		case "TokenBought":
			return handleTokenBoughtEvent(runtime, event);
		case "TokenSold":
			return handleTokenSoldEvent(runtime, event);
		case "FlapTokenProgressChanged":
			return handleProgressChangedEvent(runtime, event);
		case "LaunchedToDEX":
			return handleLaunchedToDexEvent(runtime, event);
		default: {
			const exhaustiveCheck: never = event;
			return exhaustiveCheck;
		}
	}
}
