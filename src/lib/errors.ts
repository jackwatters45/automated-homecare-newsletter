import type express from "express";
import logger from "../lib/logger.js";

export class HttpException extends Error {
	constructor(
		public readonly statusCode: number,
		public readonly message: string,
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		public readonly details?: any,
	) {
		super(message);
		this.name = "HttpException";
	}
}

export class DatabaseError extends Error {
	constructor(
		public readonly message: string,
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		public readonly details?: any,
	) {
		super(message);
		this.name = "DatabaseError";
	}
}

export function handleErrors(
	err: Error | HttpException | DatabaseError,
	req: express.Request,
	res: express.Response,
	next: express.NextFunction,
) {
	let statusCode = 500;
	let errorMessage = "Internal Server Error";
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	let errorDetails: any = undefined;

	if (err instanceof HttpException) {
		statusCode = err.statusCode;
		errorMessage = err.message;
		errorDetails = err.details;
	} else if (err instanceof DatabaseError) {
		statusCode = 503; // Service Unavailable
		errorMessage = "Database Error";
		errorDetails = err.details;
	} else if (err.name === "UnauthorizedError") {
		statusCode = 401;
		errorMessage = "Invalid token";
	}

	// Log the error
	logger.error(`${statusCode} - ${errorMessage}`, {
		path: req.path,
		method: req.method,
		error: err,
		details: errorDetails,
	});

	// Send response to client
	res.status(statusCode).json({
		error: errorMessage,
		details: errorDetails,
		path: req.path,
		timestamp: new Date().toISOString(),
	});
}
