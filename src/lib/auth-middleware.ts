import type { NextFunction, Request, Response } from "express";
import jwt, { type Secret } from "jsonwebtoken";

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

if (!SUPABASE_JWT_SECRET) {
	throw new Error("SUPABASE_JWT_SECRET is not set in the environment variables");
}

export function authMiddleware(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	const authHeader = req.headers.authorization;

	if (!authHeader) {
		return res.status(401).json({ error: "Authorization header is missing" });
	}

	const token = authHeader.split(" ")[1];

	try {
		const decoded = jwt.verify(token, SUPABASE_JWT_SECRET as Secret);

		// biome-ignore lint/suspicious/noExplicitAny: <>
		(req as any).user = decoded;
		next();
	} catch (error) {
		console.error("Token verification failed:", error);
		return res.status(401).json({ error: "Invalid token" });
	}
}
