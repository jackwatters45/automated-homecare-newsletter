// lib/errorMiddleware.ts

import type { NextFunction, Request, Response } from "express";
import { handleError } from "./errorHandler.js";
import {
	AppError,
	DatabaseError,
	NetworkError,
	NotFoundError,
	ValidationError,
} from "./errors.js";

export function errorMiddleware(
	err: Error,
	req: Request,
	res: Response,
	next: NextFunction,
) {
	if (err instanceof AppError) {
		handleError(err, { path: req.path, method: req.method });

		if (err instanceof DatabaseError) {
			res.status(503).json({ message: "Database error occurred" });
		} else if (err instanceof NetworkError) {
			res.status(502).json({ message: "Network error occurred" });
		} else if (err instanceof ValidationError) {
			res.status(400).json({ message: err.message });
		} else if (err instanceof NotFoundError) {
			res.status(404).json({ message: err.message });
		} else {
			res.status(500).json({ message: "An unexpected error occurred" });
		}
	} else {
		handleError(err, { path: req.path, method: req.method });
		res.status(500).json({ message: "An unexpected error occurred" });
	}
}
