import dotenv from "dotenv";
import type { Config } from "drizzle-kit";
import logger from "./src/lib/logger";
import { getEnv } from "./src/lib/utils";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

const schemaPath = isProduction ? "./dist/db/schema.js" : "./src/db/schema.ts";

const getDbUrl = () => {
	const dbUrl = process.env.DATABASE_URL;
	if (!dbUrl) {
		logger.error("DATABASE_URL is not set", {
			env: process.env,
			isProduction,
			schemaPath,
			dbUrl,
		});
		throw new Error("DATABASE_URL is not set");
	}
	return dbUrl;
};

const appName = process.env.APP_NAME;
if (!appName) {
	throw new Error("APP_NAME is not set");
}

export default {
	schema: schemaPath,
	dialect: "postgresql",
	dbCredentials: { url: getDbUrl() },
	tablesFilter: [appName],
} satisfies Config;
