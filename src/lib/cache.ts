import { Redis } from "@upstash/redis";
import type { ArticleWithOptionalSource } from "../types/index.js";
import { AppError } from "./errors.js";
import logger from "./logger.js";

const getRedisArgs = () => {
	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;

	if (!url || !token) {
		throw new AppError("Upstash Redis configuration is missing");
	}

	return {
		url,
		token,
	};
};
const redis = new Redis(getRedisArgs());

export async function setCache(
	key: string,
	data: ArticleWithOptionalSource[],
	ttl = 86400,
): Promise<void> {
	try {
		await redis.set(key, JSON.stringify(data), { ex: ttl });
	} catch (error) {
		logger.error("Error setting cache:", error);
		throw error;
	}
}

export async function getCache(
	key: string,
): Promise<ArticleWithOptionalSource[] | null> {
	try {
		return await redis.get<ArticleWithOptionalSource[]>(key);
	} catch (error) {
		logger.error("Error getting cache:", error);
		return null;
	}
}

export async function clearCache(key: string): Promise<void> {
	try {
		await redis.del(key);
	} catch (error) {
		logger.error("Error clearing cache:", error);
		throw error;
	}
}
