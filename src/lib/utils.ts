import { promises as fs } from "node:fs";
import path from "node:path";
import Bottleneck from "bottleneck";
import debug from "debug";
import type { Page } from "puppeteer";

import { model } from "../app/index.js";
import {
	BASE_PATH,
	DESCRIPTION_MAX_LENGTH,
	RECURRING_FREQUENCY,
} from "../lib/constants.js";

const log = debug(`${process.env.APP_NAME}:utils.ts`);

let aiCallCount = 0;
function logAiCall(prompt: string) {
	aiCallCount++;
	log(`AI model called ${aiCallCount} times. Prompt: ${prompt.slice(0, 50)}...`);
}

export async function generateJSONResponseFromModel<T>(
	prompt: string,
): Promise<T> {
	const result = await model.generateContent(prompt);
	logAiCall(prompt);
	const response = await result.response;

	const text = response.text();

	return parseJsonString(text);
}

function parseJsonString(jsonString: string) {
	// Remove the ```json and ``` markers
	const cleanedString = jsonString
		.replace(/^```json\n/, "")
		.replace(/\n```$/, "")
		.trim();

	// Parse the JSON string
	try {
		return JSON.parse(cleanedString);
	} catch (error) {
		// If parsing fails, check if it's a simple string
		if (cleanedString.startsWith('"') && cleanedString.endsWith('"')) {
			return cleanedString.slice(1, -1);
		}

		return cleanedString;
	}
}

export function ensureHttps(url: string): string {
	return url.startsWith("http://") ? url.replace("http://", "https://") : url;
}

export function constructFullUrl(
	baseUrl: string,
	relativePath: string | undefined,
): string | undefined {
	if (!relativePath) return undefined;

	const trimmedBaseUrl = baseUrl.replace(/\/+$/, "");
	const trimmedPath = relativePath.replace(/^\/+/, "");

	const baseUrlParts = trimmedBaseUrl.split("/");
	const pathParts = trimmedPath.split("/");

	while (baseUrlParts[baseUrlParts.length - 1] === pathParts[0]) {
		baseUrlParts.pop();
	}

	return `${baseUrlParts.join("/")}/${pathParts.join("/")}`;
}

export function convertStringDatesToDate<T extends { date?: string }>(
	jsonData: T[],
): (T & { date?: Date })[] {
	return jsonData.map((item) => ({
		...item,
		date: item.date ? new Date(item.date) : undefined,
	}));
}

export function truncateDescription(description: string): string {
	const words = description
		.trim()
		.split(/[\p{P}\s]+/u)
		.slice(0, DESCRIPTION_MAX_LENGTH);

	// Remove trailing punctuation or spaces
	while (words.length > 0 && /^[\p{P}\s]+$/u.test(words[words.length - 1])) {
		words.pop();
	}

	// Join the words and add ellipsis if truncated
	const truncated = words.join(" ");
	return truncated.length < description.trim().length
		? `${truncated}...`
		: truncated;
}

export async function fetchPageContent(
	url: string,
	browserInstance: Page,
): Promise<string> {
	try {
		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			return await response.text();
		} catch (error) {
			await browserInstance.goto(url);
			return await browserInstance.content();
		}
	} catch (error) {
		console.error("Error in fetchPageContent:", error);
		throw error;
	}
}

const limiter = new Bottleneck({
	minTime: 1000,
	maxConcurrent: 1,
});

export async function retry<T>(fn: () => Promise<T>, maxRetries = 3) {
	let retries = 0;
	while (retries < maxRetries) {
		try {
			return await fn();
		} catch (error) {
			retries++;
			if (retries === maxRetries) throw error;
			await new Promise((resolve) => setTimeout(resolve, 2 ** retries * 1000));
		}
	}
}

export function getPastWeekDate(): {
	start: string;
	end: string;
	year: number;
} {
	const pastWeek = new Date().getTime() - RECURRING_FREQUENCY;
	const formattedPastWeek = new Date(pastWeek).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	const today = new Date();
	const formattedToday = new Date(today).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	return {
		start: formattedPastWeek,
		end: formattedToday,
		year: today.getFullYear(),
	};
}

export function shuffleArray<T>(array: T[]): T[] {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}

export async function writeTestData<T>(name: string, data: T) {
	await fs.writeFile(
		path.join(BASE_PATH, "tests", "data", name),
		JSON.stringify(data, null, 2),
	);
}
