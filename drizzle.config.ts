import dotenv from "dotenv";
import type { Config } from "drizzle-kit";
import { IS_DEVELOPMENT } from "./src/lib/constants";
import { AppError } from "./src/lib/errors.js";
import logger from "./src/lib/logger";

dotenv.config();

const schemaPath = IS_DEVELOPMENT
	? "./src/db/schema.ts"
	: "./dist/db/schema.js";

const getDbUrl = () => {
	const dbUrl = process.env.DATABASE_URL;
	if (!dbUrl) {
		logger.error("DATABASE_URL is not set", {
			env: process.env,
			IS_DEVELOPMENT,
			schemaPath,
			dbUrl,
		});
		throw new AppError("DATABASE_URL is not set");
	}
	return dbUrl;
};

const appName = process.env.APP_NAME;
if (!appName) {
	throw new AppError("APP_NAME is not set");
}

export default {
	schema: schemaPath,
	dialect: "postgresql",
	dbCredentials: { url: getDbUrl() },
	tablesFilter: [appName],
} satisfies Config;
