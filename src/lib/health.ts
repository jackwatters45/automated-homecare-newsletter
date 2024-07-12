import fs from "node:fs";
import path from "node:path";
import debug from "debug";
import { API_URL, BASE_PATH } from "./constants.js";

const log = debug(`${process.env.APP_NAME}:health.ts`);

export async function pingServer() {
	try {
		const response = await fetch(`${API_URL}/health`);
		if (response.ok) return log(`Server is up. Status: ${response.status}`);

		fs.createWriteStream(path.join(BASE_PATH, "health.log"), { flags: "a" });

		const responseMsg = `Server returned an error. Status: ${response.status}`;
		log(responseMsg);
		throw new Error(responseMsg);
	} catch (error) {
		const msg = `Failed to reach the server: ${error instanceof Error ? error.message : error}`;

		log(msg);
		console.error(msg);
		throw new Error(msg);
	}
}
