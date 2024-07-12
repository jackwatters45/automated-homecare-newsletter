import fs from "node:fs";
import path from "node:path";
import debug from "debug";
import { API_URL, BASE_PATH } from "./constants.js";
import { useLogFile } from "./utils.js";

const log = debug(`${process.env.APP_NAME}:health.ts`);

export async function pingServer() {
	const writeLog = useLogFile("health.log");
	try {
		const response = await fetch(`${API_URL}/health`);
		if (response.ok) {
			writeLog(`Server is up. Status: ${response.status}`);
			return log(`Server is up. Status: ${response.status}`);
		}

		writeLog(`Server returned an error. Status: ${response.status}`);
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
