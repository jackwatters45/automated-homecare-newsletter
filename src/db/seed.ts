import "dotenv/config";
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
		console.log("Newsletter frequency setting seeded successfully");
	} catch (error) {
		console.error("Error seeding newsletter frequency setting:", error);
	}
}

seedSettings();
