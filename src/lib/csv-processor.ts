import fs from "node:fs";
import readline from "node:readline";
import { parentPort, workerData } from "node:worker_threads";
import { z } from "zod";
import logger from "../lib/logger.js";
import type { RecipientFromEpic, RecipientStatus } from "../types/index.js";
import { AppError } from "./errors.js";
import { emailSchema } from "./validation.js";

interface WorkerMessage {
	type: "complete" | "error";
	results?: {
		processedUsers: RecipientFromEpic[];
	};
	error?: string;
}

const UNSUBSCRIBED_KEYWORDS = ["No", "Excluded"];

export const syncRecipientSchema = z.object({
	fullName: z.string().min(2).max(100),
	email: emailSchema,
	status: z.string().transform((status) => {
		// status normalized to "subscribed" or "unsubscribed"
		if (UNSUBSCRIBED_KEYWORDS.includes(status)) {
			return "unsubscribed";
		}
		return "subscribed";
	}),
});
export const syncRecipientsSchema = z.array(syncRecipientSchema);

export type SyncRecipientsInput = z.infer<typeof syncRecipientsSchema>;

async function processUsers(filePath: string) {
	try {
		const fileStream = fs.createReadStream(filePath);

		const rl = readline.createInterface({
			input: fileStream,
			crlfDelay: Number.POSITIVE_INFINITY,
		});

		const processedUsers: RecipientFromEpic[] = [];
		let isFirstLine = true;
		let headers: string[] = [];

		for await (const line of rl) {
			if (isFirstLine) {
				headers = line.split(",").map((header) => header.trim());
				isFirstLine = false;
				continue;
			}

			try {
				const values = line.split(",").map((value) => value.trim());
				const record: Record<string, string> = {};
				for (let i = 0; i < headers.length; i++) {
					record[headers[i]] = values[i] || "";
				}

				if (!record["Account Name"] || !record["Email Address"] || !record.Status) {
					continue;
				}

				const user: RecipientFromEpic = {
					fullName: record["Account Name"] || "",
					email: record["Email Address"] || "",
					status: record.Status as RecipientStatus,
				};

				const parsedUser = syncRecipientSchema.safeParse(user);

				if (!parsedUser.success) {
					logger.info(`Removed invalid user: ${user.email}`);
					continue;
				}

				processedUsers.push(parsedUser.data);
			} catch (error) {
				logger.error(`Error processing line: ${error}`);
			}
		}

		// Clean up the original CSV file after processing
		await fs.promises.unlink(filePath);

		return processedUsers;
	} catch (error) {
		throw new AppError("Failed to process CSV", { cause: error });
	}
}

// Check if this script is being run as a worker
if (workerData?.filePath) {
	processUsers(workerData.filePath)
		.then((processedUsers) => {
			parentPort?.postMessage({
				type: "complete",
				results: {
					processedUsers,
				},
			} as WorkerMessage);
		})
		.catch((error) => {
			logger.error("Error processing CSV:", error);
			parentPort?.postMessage({
				type: "error",
				error: error.message,
			} as WorkerMessage);
		});
}

// Export the function for potential direct usage
export { processUsers as processCSV };
