import os from "node:os";
import debug from "debug";
import { desc, gte } from "drizzle-orm";
import type { Request, Response } from "express";
import { db } from "../db/index.js";
import { recipients } from "../db/schema.js";
import { cronLogs } from "../db/schema.js"; // Assuming you have a cronLogs table
import { API_URL } from "./constants.js";
import logger from "./logger.js";

const log = debug(`${process.env.APP_NAME}:health.ts`);

export async function pingServer() {
	try {
		const response = await fetch(`${API_URL}/health`);
		if (response.ok) {
			const message = `Server is up. Status: ${response.status}`;
			logger.info(message);
			log(message);
			return message;
		}

		const errorMessage = `Server returned an error. Status: ${response.status}`;
		logger.error(errorMessage);
		throw new Error(errorMessage);
	} catch (error) {
		const errorMessage = `Failed to reach the server: ${error instanceof Error ? error.message : error}`;
		logger.error(errorMessage);
		throw new Error(errorMessage);
	}
}

export async function healthCheck(req: Request, res: Response) {
	try {
		const dbStatus = await checkDatabaseStatus();
		const cronStatus = await checkCronJobStatus();
		const systemMetrics = getSystemMetrics();

		res.status(200).json({
			status: "OK",
			message: "Server is up and running",
			database: dbStatus,
			cronJobs: cronStatus,
			systemMetrics: systemMetrics,
		});
	} catch (error) {
		const errorMessage = "Health check failed";
		logger.error(errorMessage, { error });
		res.status(500).json({
			status: "ERROR",
			message: errorMessage,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

async function checkDatabaseStatus(): Promise<string> {
	try {
		await db.select().from(recipients).limit(1);
		return "connected";
	} catch (error) {
		logger.error("Database connection failed", { error });
		return "disconnected";
	}
}

async function checkCronJobStatus(): Promise<{ [key: string]: string }> {
	try {
		const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
		const recentLogs = await db
			.select()
			.from(cronLogs)
			.where(gte(cronLogs.executionTime, tenMinutesAgo))
			.orderBy(desc(cronLogs.executionTime));

		const jobStatuses: { [key: string]: string } = {};
		for (const log of recentLogs) {
			jobStatuses[log.jobName] = log.status;
		}

		return jobStatuses;
	} catch (error) {
		logger.error("Failed to check cron job status", { error });
		return { error: "Failed to retrieve cron job status" };
	}
}

function getSystemMetrics() {
	return {
		memoryUsage: process.memoryUsage(),
		cpuUsage: process.cpuUsage(),
		uptime: process.uptime(),
		freeMemory: os.freemem(),
		totalMemory: os.totalmem(),
	};
}
