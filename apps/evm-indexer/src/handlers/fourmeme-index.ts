import type { FourMemeEvent, FourMemeEventName } from "../lib/fourmeme-events.js";
import type { IndexerRuntime } from "../lib/runtime.js";
import { handleErc8004RegisteredEvent } from "./erc8004-registered.js";
import { handleLiquidityAddedEvent } from "./fourmeme-liquidity-added.js";
import { handleNftAddedEvent, handleNftRemovedEvent } from "./fourmeme-nft-registry.js";
import { handleTokenCreateEvent } from "./fourmeme-token-create.js";
import { handleTokenPurchaseEvent } from "./fourmeme-token-purchase.js";
import { handleTokenSaleEvent } from "./fourmeme-token-sale.js";
import { handleTradeStopEvent } from "./fourmeme-trade-stop.js";
import type { PortalEventHandlerResult } from "./index.js";

type FourMemeHandler<TEventName extends FourMemeEventName> = (
	runtime: IndexerRuntime,
	event: Extract<FourMemeEvent, { eventName: TEventName }>,
) => Promise<PortalEventHandlerResult>;

export const handlerMap: { [K in FourMemeEventName]: FourMemeHandler<K> } = {
	TokenCreate: handleTokenCreateEvent,
	TokenPurchase: handleTokenPurchaseEvent,
	TokenSale: handleTokenSaleEvent,
	LiquidityAdded: handleLiquidityAddedEvent,
	TradeStop: handleTradeStopEvent,
	NftAdded: handleNftAddedEvent,
	NftRemoved: handleNftRemovedEvent,
	Registered: handleErc8004RegisteredEvent,
};

export async function processFourMemeEvent(
	runtime: IndexerRuntime,
	event: FourMemeEvent,
): Promise<PortalEventHandlerResult> {
	const handler = handlerMap[event.eventName] as FourMemeHandler<typeof event.eventName>;
	return handler(runtime, event as never);
}
