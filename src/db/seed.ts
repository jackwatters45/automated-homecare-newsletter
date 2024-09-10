import "dotenv/config";
import logger from "../lib/logger.js";
import { db } from "./index.js";
import { settings } from "./schema.js";

async function seedSettings() {
	try {
		await db
			.insert(settings)
			.values({
				key: "newsletterFrequency",
				value: "1", // Default to 1 week
			})
			.onConflictDoUpdate({
				target: settings.key,
				set: { value: "1" },
			});
		logger.info("Seeded newsletter frequency setting");
	} catch (error) {
		logger.error("Error seeding newsletter frequency setting:", error);
	}
}

seedSettings();
