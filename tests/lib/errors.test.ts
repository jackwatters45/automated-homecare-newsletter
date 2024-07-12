import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpException, handleErrors } from "../../src/lib/errors";

describe("HttpException", () => {
	it("should create an instance of HttpException with correct properties", () => {
		const errorCode = 400;
		const message = "Bad Request";
		const exception = new HttpException(errorCode, message);

		expect(exception).toBeInstanceOf(HttpException);
		expect(exception.errorCode).toBe(errorCode);
		expect(exception.message).toBe(message);
	});
});

describe("handleErrors", () => {
	let req: Request;
	let res: Response;
	let next: NextFunction;

	beforeEach(() => {
		req = {} as Request;
		res = {
			status: vi.fn().mockReturnThis(),
			json: vi.fn().mockReturnThis(),
		} as unknown as Response;
		next = vi.fn() as unknown as NextFunction;
	});

	it("should handle HttpException and respond with correct status and message", () => {
		const errorCode = 404;
		const message = "Not Found";
		const error = new HttpException(errorCode, message);

		try {
			handleErrors(error, req, res, next);
		} catch (err) {
			expect(res.status).toHaveBeenCalledWith(errorCode);
			expect(res.json).toHaveBeenCalledWith(message);
			expect(err).toBeInstanceOf(Error);
			expect(err.message).toBe(message);
		}
	});

	it("should handle generic Error and respond with status 500 and message", () => {
		const message = "Internal Server Error";
		const error = new Error(message);

		try {
			handleErrors(error, req, res, next);
		} catch (err) {
			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith(message);
			expect(err).toBeInstanceOf(Error);
			expect(err.message).toBe(message);
		}
	});
});
