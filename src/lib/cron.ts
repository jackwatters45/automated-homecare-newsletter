import debug from "debug";
import { schedule } from "node-cron";
import type { ScheduledTask } from "node-cron";

import { sendNewsletterReviewEmail } from "../app/index.js";
import { db } from "../db/index.js";
import { cronLogs } from "../db/schema.js";
import { pingServer } from "./health.js";
import { retry } from "./utils.js";

const log = debug(`${process.env.APP_NAME}:cron.ts`);

// Function to check if it's an alternate Monday
export function isAlternateMonday(date: Date) {
	const firstMondayOfYear = new Date(
		date.getFullYear(),
		0,
		1 + ((1 - new Date(date.getFullYear(), 0, 1).getDay() + 7) % 7),
	);
	const weeksSinceFirstMonday = Math.floor(
		(date.getTime() - firstMondayOfYear.getTime()) / (7 * 24 * 60 * 60 * 1000),
	);
	return weeksSinceFirstMonday % 2 === 0;
}

async function logCronExecution(
	jobName: string,
	status: "success" | "failure",
	message: string,
): Promise<void> {
	try {
		await db.insert(cronLogs).values({
			jobName,
			executionTime: new Date(),
			status,
			message,
		});
		log(`Cron job ${jobName} ${status}: ${message}`);
	} catch (error) {
		console.error(`Failed to log cron execution: ${error}`);
		log(`Failed to log cron execution: ${error}`);
	}
}

async function runNewsletterTask(): Promise<void> {
	const jobName = "sendNewsletterReviewEmail";
	try {
		if (isAlternateMonday(new Date())) {
			await retry(sendNewsletterReviewEmail);
			await logCronExecution(
				jobName,
				"success",
				"Newsletter review email sent successfully",
			);
		}
	} catch (error) {
		await logCronExecution(
			jobName,
			"failure",
			`Failed to send newsletter review email: ${error}`,
		);
	}
}

async function runHealthCheckTask(): Promise<void> {
	const jobName = "healthCheck";
	try {
		await pingServer();
		await logCronExecution(
			jobName,
			"success",
			"Health check completed successfully",
		);
	} catch (error) {
		await logCronExecution(jobName, "failure", `Health check failed: ${error}`);
	}
}

export function setupCronJobs(): void {
	const tasks: { [key: string]: ScheduledTask } = {
		newsletter: schedule("0 9 * * 1", runNewsletterTask, {
			timezone: "America/Halifax",
		}),
		healthCheck: schedule("0 0 * * *", runHealthCheckTask, { timezone: "UTC" }),
	};

	process.on("SIGINT", () => {
		log("Stopping cron jobs...");
		for (const task of Object.values(tasks)) {
			task.stop();
		}
		process.exit(0);
	});

	log("Cron jobs set up successfully");
}
