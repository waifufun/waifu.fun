import pino from "pino";
import pretty from "pino-pretty";

const stream = pretty({
	colorize: true,
	translateTime: "SYS:standard",
	ignore: "pid,hostname",
	messageFormat: "{msg}",
	errorLikeObjectKeys: ["err", "error"],
	errorProps: "message,stack,code,type",
});

const logger = pino({
	level: process.env.LOG_LEVEL || "info",
	serializers: {
		err: pino.stdSerializers.err,
		error: pino.stdSerializers.err,
	},
	transport: {
		target: "pino-pretty",
		options: {
			colorize: true,
			translateTime: "SYS:standard",
			ignore: "pid,hostname",
			messageFormat: "{msg}",
			errorLikeObjectKeys: ["err", "error"],
			errorProps: "message,stack,code,type",
		},
	},
});

export default logger;
