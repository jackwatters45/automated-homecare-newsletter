import cron from "node-cron";
import { GenerateNewsletter } from "src/app/index.js";
import { pingServer } from "./health.js";
import { retry } from "./utils.js";

export function setupCronJobs() {
	// Schedule the main task to run every two weeks on Monday at 00:00
	cron.schedule(
		"0 0 * * 1",
		() => {
			const currentDate = new Date();
			if (currentDate.getDate() <= 14) {
				console.log("Running main task (GenerateNewsletter)");
				retry(GenerateNewsletter);
			}
		},
		{ timezone: "UTC" },
	);

	// Schedule the test task (health check) to run on the alternate weeks
	cron.schedule(
		"0 0 * * 1",
		() => {
			const currentDate = new Date();
			if (currentDate.getDate() > 14) {
				console.log("Running health check");
				pingServer();
			}
		},
		{ timezone: "UTC" },
	);

	console.log("Cron jobs set up successfully");
}
