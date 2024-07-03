import debug from "debug";

import type { Page } from "puppeteer";
import { model } from "..";
import { DESCRIPTION_MAX_LENGTH } from "./constants";

const log = debug(`${process.env.APP_NAME}:utils.ts`);

let calledAiCount = 0;
function logCallAi(prompt: string) {
	calledAiCount++;
	log("Google ai called", calledAiCount, prompt.slice(0, 20));
}

export async function generateStringResponse(prompt: string): Promise<string> {
	const result = await model.generateContent(prompt);
	logCallAi(prompt);
	const response = await result.response;

	return response.text();
}

export async function generateJsonResponse<T>(prompt: string): Promise<T[]> {
	const result = await model.generateContent(prompt);
	logCallAi(prompt);
	const response = await result.response;

	const text = response.text();

	log(response.usageMetadata);

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

	const descContent = descArr.slice(0, DESCRIPTION_MAX_LENGTH).join(" ");

	if (descContent.endsWith(".")) return descContent;

	return `${descContent}...`;
}

export async function tryFetchPageHTML(url: string, browserPage: Page) {
	try {
		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			return await response.text();
		} catch (error) {
			await browserPage.goto(url);
			return await browserPage.content();
		}
	} catch (error) {
		console.error("Error in fetchPageHTML:", error);
		throw error;
	}
}
