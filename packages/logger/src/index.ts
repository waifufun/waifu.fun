import winston from "winston";
const LOG_FILE_PATH = "./logs/autofun-backend.log";

const dogEnabled = process.env.DOG_LOGGER_ENABLED === "true";

const DogLogger = winston.createLogger({
	level: "info",
	format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
	transports: [
		new winston.transports.File({ filename: LOG_FILE_PATH }),
		new winston.transports.Console({
			format: winston.format.combine(
				winston.format.colorize(),
				winston.format.printf(({ timestamp, level, message, ...meta }) => {
					let logMessage = `${timestamp} [${level}] ${message}`;
					if (Object.keys(meta).length) {
						logMessage += ` ${JSON.stringify(meta, null, 2)}`;
					}
					return logMessage;
				}),
			),
		}),
	],
});

if (!dogEnabled) {
	const transportToRemove = DogLogger?.transports?.[0];
	if (transportToRemove) {
		DogLogger.remove(transportToRemove);
	}
}

export default DogLogger;
