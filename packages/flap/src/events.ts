import { type Hex, type Log, type TransactionReceipt, decodeEventLog, parseEventLogs } from "viem";

import { portalAbi } from "./abi/portal.js";
import { FLAP_EVENT_NAMES } from "./constants.js";

export type FlapPortalEventName = (typeof FLAP_EVENT_NAMES)[number];

export const isFlapPortalEventName = (value: string): value is FlapPortalEventName =>
	(FLAP_EVENT_NAMES as readonly string[]).includes(value);

export const decodePortalEventLog = (input: {
	data: Hex;
	topics: readonly Hex[];
}) =>
	decodeEventLog({
		abi: portalAbi,
		data: input.data,
		topics: [...input.topics] as [Hex, ...Hex[]],
	});

export const parsePortalEventLogs = (logs: readonly Pick<Log, "data" | "topics">[]) =>
	parseEventLogs({
		abi: portalAbi,
		logs: logs as unknown as Log[],
		strict: false,
	});

export const parsePortalReceiptEvents = (receipt: Pick<TransactionReceipt, "logs">) =>
	parsePortalEventLogs(receipt.logs);

export const filterPortalEvents = <TEventName extends FlapPortalEventName>(
	logs: readonly Pick<Log, "data" | "topics">[],
	eventName: TEventName,
) => parsePortalEventLogs(logs).filter((log) => log.eventName === eventName);

export const getPortalLaunchLifecycleEvents = (logs: readonly Pick<Log, "data" | "topics">[]) =>
	parsePortalEventLogs(logs).filter((log) =>
		[
			"TokenCreated",
			"TokenCurveSet",
			"TokenCurveSetV2",
			"TokenDexSupplyThreshSet",
			"TokenQuoteSet",
			"TokenMigratorSet",
			"TokenVersionSet",
			"FlapTokenTaxSet",
			"TokenExtensionEnabled",
			"TokenDexPreferenceSet",
			"FlapTokenStaged",
		].includes(log.eventName),
	);
