import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { schedule } from "node-cron";
import { GenerateNewsletter } from "../../src/app/index.js";
import { isAlternateMonday, setupCronJobs } from "../../src/lib/cron.js";
import { pingServer } from "../../src/lib/health.js";

// Mock external dependencies

vi.mock("node-cron");

vi.mock("../../src/app/index.js", () => ({
	GenerateNewsletter: vi.fn(),
}));

vi.mock("../../src/lib/utils.js", () => ({
	retry: vi.fn(),
}));

vi.mock("../../src/lib/health.js", () => ({
	pingServer: vi.fn(),
}));

describe("isAlternateMonday", () => {
	it("returns true for the first Monday of the year", () => {
		const firstMonday2023 = new Date(2024, 0, 1); // January 1, 2024 (first Monday)
		expect(isAlternateMonday(firstMonday2023)).toBe(true);
	});

	it("returns false for the second Monday of the year", () => {
		const secondMonday2023 = new Date(2024, 0, 8); // January 8, 2024 (second Monday)
		expect(isAlternateMonday(secondMonday2023)).toBe(false);
	});

	it("returns true for alternate Mondays", () => {
		const alternateMondayInMarch = new Date(2024, 2, 12); // March 12, 2024 (alternate Monday)
		expect(isAlternateMonday(alternateMondayInMarch)).toBe(true);
	});

	it("returns false for non-alternate Mondays", () => {
		const nonAlternateMondayInApril = new Date(2024, 3, 2); // April 2, 2024 (non-alternate Monday)
		expect(isAlternateMonday(nonAlternateMondayInApril)).toBe(false);
	});
});

describe("setupCronJobs", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-07-08")); // Set to a Monday
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.resetAllMocks();
	});

	it("sets up two cron jobs with correct schedules and timezones", () => {
		setupCronJobs();

		expect(schedule).toHaveBeenCalledTimes(2);

		// Check first cron job (newsletter)
		expect(schedule).toHaveBeenCalledWith("0 9 * * 1", expect.any(Function), {
			timezone: "America/Halifax",
		});

		// Check second cron job (health check)
		expect(schedule).toHaveBeenCalledWith("0 0 * * *", expect.any(Function), {
			timezone: "UTC",
		});
	});

	it("calls GenerateNewsletter on alternate Mondays", async () => {
		setupCronJobs();

		console.log("Schedule calls:", (schedule as any).mock.calls);

		// Advance time to trigger the job
		vi.advanceTimersByTime(1000 * 60 * 60 * 24 * 15); // Advance by 15 days

		// If the job is asynchronous, wait for it
		await vi.runAllTimersAsync();

		expect(schedule).toHaveBeenCalled();

		// Check if GenerateNewsletter was called
		const scheduledFunctions = (schedule as any).mock.calls.map(
			(call) => call[1],
		);
		console.log("Scheduled functions:", scheduledFunctions);

		scheduledFunctions.forEach((func) => {
			if (typeof func === "function") {
				func(new Date());
			}
		});

		expect(GenerateNewsletter).toHaveBeenCalled();
	});

	it("does not call GenerateNewsletter on non-alternate Mondays", () => {
		vi.setSystemTime(new Date(2024, 0, 8)); // Second Monday of 2023
		setupCronJobs();

		const newsletterJob = (schedule as any).mock.calls[0][1];
		newsletterJob();

		expect(GenerateNewsletter).not.toHaveBeenCalled();
	});

	it("calls pingServer for health check job", async () => {
		setupCronJobs();

		console.log("Schedule calls:", (schedule as any).mock.calls);

		// Advance time to trigger the job
		vi.advanceTimersByTime(1000 * 60 * 60 * 48); // Advance by 25 hours

		// If the job is asynchronous, wait for it
		await vi.runAllTimersAsync();

		expect(schedule).toHaveBeenCalled();

		// Check if pingServer was called
		const scheduledFunctions = (schedule as any).mock.calls.map(
			(call) => call[1],
		);
		console.log("Scheduled functions:", scheduledFunctions);

		scheduledFunctions.forEach((func) => {
			if (typeof func === "function") {
				func(new Date());
			}
		});

		expect(pingServer).toHaveBeenCalled();
	});
});
