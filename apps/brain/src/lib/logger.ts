import pino from "pino";

export const logger = pino({
	name: "waifu-brain",
	level: process.env.LOG_LEVEL ?? "info",
	base: undefined,
	timestamp: pino.stdTimeFunctions.isoTime,
});

export type { Logger } from "pino";
