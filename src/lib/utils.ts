import debug from "debug";

import Bottleneck from "bottleneck";
import type { Page } from "puppeteer";
import { model } from "../app/index.js";
import {
	DESCRIPTION_MAX_LENGTH,
	RECURRING_FREQUENCY,
} from "../lib/constants.js";

const log = debug(`${process.env.APP_NAME}:utils.ts`);

let aiCallCount = 0;
function logAiCall(prompt: string) {
	aiCallCount++;
	log("AI model called", aiCallCount, prompt.slice(0, 20));
}

export async function generateStringResponse(prompt: string): Promise<string> {
	const result = await model.generateContent(prompt);
	logAiCall(prompt);
	const response = await result.response;
	return response.text();
}

export async function generateJsonResponse<T>(prompt: string): Promise<T[]> {
	const result = await model.generateContent(prompt);
	logAiCall(prompt);
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
	const words = description.trim()?.split(" ");
	const truncatedContent = words.slice(0, DESCRIPTION_MAX_LENGTH).join(" ");
	return truncatedContent.endsWith(".")
		? truncatedContent
		: `${truncatedContent}...`;
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
