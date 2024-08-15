import debug from "debug";
import { schedule } from "node-cron";
import type { ScheduledTask } from "node-cron";

import { eq } from "drizzle-orm/expressions";
import { sendNewsletterReviewEmail } from "../app/index.js";
import { db } from "../db/index.js";
import { cronLogs, settings } from "../db/schema.js";
import { pingServer } from "./health.js";
import logger from "./logger.js";
import { retry } from "./utils.js";

const log = debug(`${process.env.APP_NAME}:cron.ts`);

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

		if (status === "success") {
			logger.info("Cron job success", { jobName, message });
		} else {
			logger.error("Cron job failure", { jobName, message });
		}
	} catch (error) {
		logger.error("Failed to log cron execution", { error, jobName, message });
	}
}

async function runNewsletterTask(): Promise<void> {
	const jobName = "sendNewsletterReviewEmail";
	try {
		await retry(sendNewsletterReviewEmail);
		await logCronExecution(
			jobName,
			"success",
			"Newsletter review email sent successfully",
		);
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

async function getNewsletterFrequency(): Promise<number> {
	const [frequencySetting] = await db
		.select()
		.from(settings)
		.where(eq(settings.key, "newsletterFrequency"));

	if (!frequencySetting) {
		logger.warn("Newsletter frequency setting not found, defaulting to 1 week");
		return 1;
	}

	const frequency = Number.parseInt(frequencySetting.value, 10);
	if (Number.isNaN(frequency) || frequency < 1 || frequency > 4) {
		logger.warn(
			`Invalid newsletter frequency: ${frequencySetting.value}, defaulting to 1 week`,
		);
		return 1;
	}

	return frequency;
}

// TODO: Confirm valid
function createNewsletterCronExpression(weekInterval: number): string {
	switch (weekInterval) {
		case 1:
			// Every Monday at 9 AM
			return "0 9 * * 1";
		case 2:
			// Every other Monday at 9 AM
			return "0 9 1-7,15-21 * 1";
		case 3:
			// Every third Monday at 9 AM
			return "0 9 1-7,22-28 * 1";
		case 4:
			// Every fourth Monday at 9 AM
			return "0 9 1-7 * 1";
		default:
			throw new Error("Week interval must be 1, 2, 3, or 4");
	}
}

let newsletterTask: ScheduledTask | null = null;

export async function setupCronJobs(): Promise<void> {
	const frequency = await getNewsletterFrequency();
	const newsletterCronExpression = createNewsletterCronExpression(frequency);

	const tasks: { [key: string]: ScheduledTask } = {
		healthCheck: schedule("0 0 * * *", runHealthCheckTask, { timezone: "UTC" }),
	};

	newsletterTask = schedule(newsletterCronExpression, runNewsletterTask, {
		timezone: "America/Halifax",
	});

	process.on("SIGINT", () => {
		log("Stopping cron jobs...");
		for (const task of Object.values(tasks)) {
			task.stop();
		}
		if (newsletterTask) {
			newsletterTask.stop();
		}
		process.exit(0);
	});

	log(
		`Cron jobs set up successfully. Newsletter scheduled to run every ${frequency} week(s) on Monday at 9 AM AST`,
	);
}

export async function updateNewsletterSchedule(): Promise<void> {
	const frequency = await getNewsletterFrequency();
	const newsletterCronExpression = createNewsletterCronExpression(frequency);

	if (newsletterTask) {
		newsletterTask.stop();
	}

	newsletterTask = schedule(newsletterCronExpression, runNewsletterTask, {
		timezone: "America/Halifax",
	});

	log(
		`Newsletter schedule updated to run every ${frequency} week(s) on Monday at 9 AM AST`,
	);
}

// Function to update the newsletter frequency
export async function updateNewsletterFrequency(
	newFrequency: number,
): Promise<void> {
	if (newFrequency < 1 || newFrequency > 4) {
		throw new Error("Newsletter frequency must be 1, 2, 3, or 4 weeks");
	}

	await db
		.update(settings)
		.set({ value: newFrequency.toString() })
		.where(eq(settings.key, "newsletterFrequency"));

	await updateNewsletterSchedule();
	logger.info(`Newsletter frequency updated to every ${newFrequency} week(s)`);
}
