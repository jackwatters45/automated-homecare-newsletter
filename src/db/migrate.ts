import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index.js";

async function runMigration() {
	try {
		// This will run migrations on the database, skipping the ones already applied
		await migrate(db, { migrationsFolder: "drizzle" });
		console.log("Migration completed successfully");
	} catch (error) {
		console.error("Migration failed:", error);
	} finally {
		// Don't forget to close the connection, otherwise the script will hang
		await pool.end();
	}
}

runMigration();
