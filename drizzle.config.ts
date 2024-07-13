import dotenv from "dotenv";
import type { Config } from "drizzle-kit";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

const schemaPath = isProduction ? "./dist/db/schema.js" : "./src/db/schema.ts";

const getDbUrl = () => {
	const dbUrl = process.env.DATABASE_URL;
	if (!dbUrl) {
		throw new Error("DATABASE_URL is not set");
	}
	return dbUrl;
};

export default {
	schema: schemaPath,
	dialect: "postgresql",
	dbCredentials: { url: getDbUrl() },
} satisfies Config;
