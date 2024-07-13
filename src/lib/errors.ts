import type express from "express";

export class HttpException extends Error {
	errorCode: number;
	constructor(
		errorCode: number,
		public readonly message: string,
	) {
		super(message);
		this.errorCode = errorCode;
	}
}

export function handleErrors(
	err: Error | HttpException,
	req: express.Request,
	res: express.Response,
	next: express.NextFunction,
) {
	if (err instanceof HttpException) {
		res.status(err.errorCode).json(err.message);
		throw new Error(err.message);
	}
	res.status(500).json(err.message);
	throw new Error(err.message);
}

export class DatabaseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DatabaseError";
	}
}
