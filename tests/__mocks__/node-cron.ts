import type { ScheduleOptions, ScheduledTask } from "node-cron";
// __mocks__/node-cron.ts
import { vi } from "vitest";

export const schedule = vi.fn((cronExpression, func) => {
	console.log("Mock schedule called with:", cronExpression);
	return {
		start: () => console.log("Mock job started"),
		stop: () => console.log("Mock job stopped"),
	} as ScheduledTask;
}) as unknown as (
	cronExpression: string,
	func: (now: Date | "manual" | "init") => void,
	options?: ScheduleOptions,
) => ScheduledTask;

export default { schedule };
