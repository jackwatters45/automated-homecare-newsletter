import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const pool = new pg.Pool({
	connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

export const checkConnection = async () => {
	try {
		const client = await pool.connect();
		console.log("Successfully connected to the database");
		client.release();
	} catch (err) {
		console.error("Error connecting to the database", err);
	}
};
// checkConnection();
