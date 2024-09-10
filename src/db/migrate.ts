import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import logger from "../lib/logger.js";
import { db, pool } from "./index.js";

async function runMigration() {
	try {
		// This will run migrations on the database, skipping the ones already applied
		await migrate(db, { migrationsFolder: "drizzle" });
		logger.info("Migration completed successfully");
	} catch (error) {
		logger.error("Migration failed:", error);
	} finally {
		// Don't forget to close the connection, otherwise the script will hang
		await pool.end();
	}
}

runMigration();
