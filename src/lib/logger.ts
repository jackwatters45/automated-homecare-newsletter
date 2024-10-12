// lib/logger.ts

import util from "node:util";
import winston from "winston";

const prettyPrint = (obj: unknown) => {
	return typeof obj === "object"
		? util.inspect(obj, { colors: true, depth: null, breakLength: 80 })
		: obj;
};

const logger = winston.createLogger({
	level: "info",
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.errors({ stack: true }),
		winston.format.printf(({ level, message, timestamp, ...rest }) => {
			const prettyMessage = prettyPrint(message);
			const prettyRest = Object.keys(rest).length ? prettyPrint(rest) : "";
			return `${timestamp} [${level}]: ${prettyMessage}\n${prettyRest}`;
		}),
	),
	transports: [
		new winston.transports.Console({
			format: winston.format.combine(
				winston.format.colorize(),
				winston.format.simple(),
			),
		}),
		new winston.transports.File({
			filename: "error.log",
			level: "error",
			format: winston.format.json(),
		}),
	],
});
export default logger;
