import { type Logger, createLogger } from "@waifufun/logger";

export const logger: Logger = createLogger({
	service: "launch-indexer",
	level: process.env.LOG_LEVEL ?? "info",
	lokiUrl: process.env.LOKI_URL,
	lokiUser: process.env.LOKI_USER,
	lokiToken: process.env.LOKI_TOKEN,
});
