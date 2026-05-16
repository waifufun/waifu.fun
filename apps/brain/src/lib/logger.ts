import { type Logger, createLogger } from "@waifufun/logger";

export const logger: Logger = createLogger({
	service: "waifu-brain",
	level: process.env.LOG_LEVEL ?? "info",
});

export type { Logger };
