import debug from "debug";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema.js";

const log = debug(`${process.env.APP_NAME}:db:index.ts`);

export const pool = new pg.Pool({
	connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

export const checkConnection = async () => {
	try {
		const client = await pool.connect();
		log("Successfully connected to the database");
		client.release();
	} catch (err) {
		throw new Error("Error connecting to the database", { cause: err });
	}
};
