import debug from "debug";
import cron from "node-cron";

import { GenerateNewsletter } from "src/app/index.js";
import { pingServer } from "./health.js";
import { retry } from "./utils.js";

const log = debug(`${process.env.APP_NAME}:cron.ts`);

// Function to check if it's an alternate Monday
function isAlternateMonday(date: Date) {
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

export function setupCronJobs() {
	// Schedule the main task to run every two weeks on Monday at 09:00 AST
	cron.schedule(
		"0 9 * * 1",
		() => {
			if (isAlternateMonday(new Date())) retry(GenerateNewsletter);
		},
		{ timezone: "America/Halifax" },
	);

	// Schedule the test task (health check) to run every day at 00:00 UTC
	cron.schedule("0 0 * * *", () => pingServer(), { timezone: "UTC" });

	log("Cron jobs set up successfully");
}
