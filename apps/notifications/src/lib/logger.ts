import { type Logger, createLogger } from "@waifufun/logger";

export const logger: Logger = createLogger({
	service: "notifications",
	level: process.env.LOG_LEVEL ?? "info",
});
