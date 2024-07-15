import type { ScheduleOptions, ScheduledTask } from "node-cron";
// __mocks__/node-cron.ts
import { vi } from "vitest";

import debug from "debug";

const log = debug(`${process.env.APP_NAME}:tests:node-cron.ts`);

export const schedule = vi.fn((cronExpression, func) => {
	log("Mock schedule called with:", cronExpression);
	return {
		start: () => log("Mock job started"),
		stop: () => log("Mock job stopped"),
	} as ScheduledTask;
}) as unknown as (
	cronExpression: string,
	func: (now: Date | "manual" | "init") => void,
	options?: ScheduleOptions,
) => ScheduledTask;

export default { schedule };
