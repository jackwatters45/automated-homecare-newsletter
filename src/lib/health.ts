import debug from "debug";
import { db } from "../db/index.js";
import { recipients } from "../db/schema.js";
import { API_URL } from "./constants.js";
import logger from "./logger.js";
import { useLogFile } from "./utils.js";

const log = debug(`${process.env.APP_NAME}:health.ts`);

export async function pingServer() {
	const writeLog = useLogFile("health.log");
	try {
		const response = await fetch(`${API_URL}/health`);
		if (response.ok) {
			writeLog(`Server is up. Status: ${response.status}`);
			return log(`Server is up. Status: ${response.status}`);
		}

		writeLog(`Server returned an error. Status: ${response.status}`);
		const responseMsg = `Server returned an error. Status: ${response.status}`;
		log(responseMsg);
		throw new Error(responseMsg);
	} catch (error) {
		const msg = `Failed to reach the server: ${error instanceof Error ? error.message : error}`;

		log(msg);
		console.error(msg);
		throw new Error(msg);
	}
}

export async function healthCheck(req: Request, res: Response) {
	try {
		// Check database connection
		let dbStatus = "disconnected";
		try {
			await db.select().from(recipients).limit(1); // Replace 'users' with any table you have
			dbStatus = "connected";
		} catch (error) {
			console.error("Database connection failed:", error);
		}

		// Check cron job status (example)
		const cronStatus = await checkCronJobStatus(); // Implement this function based on your cron job setup

		// res.status(200).json({
		// 	status: "OK",
		// 	message: "Server is up and running",
		// 	database: dbStatus,
		// 	cronJobs: cronStatus,
		// 	memoryUsage: process.memoryUsage(),
		// });
	} catch (error) {
		// res.status(500).json({
		// 	status: "ERROR",
		// 	message: "Health check failed",
		// 	error: JSON.stringify(error),
		// });
		logger.error(error);
	}
}

// Example function to check cron job status
async function checkCronJobStatus() {
	// Implement your logic here to check the status of your cron jobs
	// This could involve checking a database for the last run time of each job
	// or any other method you use to track your cron jobs
	return "operational"; // placeholder
}
