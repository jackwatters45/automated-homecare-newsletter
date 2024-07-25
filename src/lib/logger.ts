import winston from "winston";

const logger = winston.createLogger({
	level: "info",
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.printf(({ timestamp, level, message, ...meta }) => {
			return `${timestamp} [${level}]: ${message} ${
				Object.keys(meta).length ? JSON.stringify(meta) : ""
			}`;
		}),
	),
	transports: [
		new winston.transports.Console({
			format: winston.format.simple(),
		}),
	],
});

export default logger;
