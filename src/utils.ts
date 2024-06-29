import debug from "debug";

import { APP_NAME } from "./constants";
import { model } from ".";

const log = debug(`${APP_NAME}:utils.ts`);

export async function generateJsonResponse(prompt: string) {
	const result = await model.generateContent(prompt);
	const response = await result.response;
	return parseJsonString(response.text());
}

function parseJsonString(jsonString: string) {
	// Remove the ```json and ``` markers
	const cleanedString = jsonString
		.trim()
		.replace(/^```json\n/, "")
		.replace(/\n```$/, "");

	// Parse the JSON string
	return JSON.parse(cleanedString);
}
