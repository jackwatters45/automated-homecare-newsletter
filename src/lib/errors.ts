import type express from "express";

class HttpException extends Error {
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
		return res.status(err.errorCode).json(err.message);
	}
	res.status(500).json(err.message);
}
