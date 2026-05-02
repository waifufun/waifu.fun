import { Registry, collectDefaultMetrics } from "prom-client";

export const metricsRegistry = new Registry();

collectDefaultMetrics({
	prefix: "waifu_",
	register: metricsRegistry,
});
