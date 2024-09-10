export class AppError extends Error {
	constructor(
		message: string,
		public readonly context?: Record<string, unknown>,
	) {
		super(message);
		this.name = this.constructor.name;
		Error.captureStackTrace(this, this.constructor);
	}
}

export class DatabaseError extends AppError {}
export class NetworkError extends AppError {}
export class ValidationError extends AppError {}
export class NotFoundError extends AppError {}
export class ConflictError extends AppError {}

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
