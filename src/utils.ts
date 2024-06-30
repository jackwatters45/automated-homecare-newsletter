import { promises as fs } from "node:fs";
import debug from "debug";

import { model } from ".";
import { APP_NAME } from "./constants";

const log = debug(`${APP_NAME}:utils.ts`);

export async function generateStringResponse(prompt: string): Promise<string> {
	const result = await model.generateContent(prompt);
	const response = await result.response;

	return response.text();
}

export async function generateJsonResponse<T>(prompt: string): Promise<T[]> {
	const result = await model.generateContent(prompt);
	const response = await result.response;

	const text = response.text();

	log(response.usageMetadata);
	fs.writeFile("meta.json", JSON.stringify(response.usageMetadata, null, 2));

	return parseJsonString<T>(text);
}

function parseJsonString<T = unknown>(jsonString: string): T[] {
	// Remove the ```json and ``` markers
	const cleanedString = jsonString
		.trim()
		.replace(/^```json\n/, "")
		.replace(/\n```$/, "");

	// Parse the JSON string
	try {
		return JSON.parse(cleanedString);
	} catch (error) {
		log(jsonString);
		fs.writeFile("error.json", cleanedString);
		console.error("Error parsing JSON:", error);
		throw error;
	}
}

export function convertHttpToHttps(url: string) {
	if (url.startsWith("http://")) {
		return url.replace("http://", "https://");
	}

	return url;
}

export function combineUrlParts(
	baseUrl: string,
	path: string | undefined,
): string | undefined {
	if (!path) return undefined;

	// Remove trailing slash from baseUrl and leading slash from path
	const trimmedBaseUrl = baseUrl.replace(/\/+$/, "");
	const trimmedPath = path.replace(/^\/+/, "");

	const splitBaseUrl = trimmedBaseUrl.split("/");
	const splitPath = trimmedPath.split("/");

	while (splitBaseUrl[splitBaseUrl.length - 1] === splitPath[0]) {
		splitBaseUrl.pop();
	}

	// Combine the parts, removing the overlap
	return `${splitBaseUrl.join("/")}/${splitPath.join("/")}`;
}

export function parseJsonDate<T extends { date?: string }>(jsonString: T[]) {
	return jsonString.map((item) => ({
		...item,
		date: item.date ? new Date(item.date) : undefined,
	}));
}

export function formatDescription(description: string) {
	const descArr = description?.split(" ");

	if (descArr[descArr.length - 1].endsWith(".")) descArr.pop();

	return `${descArr.slice(0, 25).join(" ")}...`;
}
