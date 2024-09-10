// lib/errorHandler.ts

import { AppError } from "./errors.js";
import logger from "./logger.js";

export function handleError(
	error: unknown,
	context?: Record<string, unknown>,
): void {
	if (error instanceof AppError) {
		logger.error(error.message, {
			...error.context,
			...context,
			stack: error.stack,
		});
	} else if (error instanceof Error) {
		logger.error(error.message, { ...context, stack: error.stack });
	} else {
		logger.error("An unknown error occurred", { error, ...context });
	}
}
