import { promises as fs } from "node:fs";
import path from "node:path";
import type * as cheerio from "cheerio";
import debug from "debug";

import robotsParser from "robots-parser";
import { model } from "../app/index.js";
import {
	BASE_PATH,
	DESCRIPTION_MAX_LENGTH,
	RECURRING_FREQUENCY,
} from "../lib/constants.js";
import type { PageToScrape } from "../types/index.js";
import { getBrowser } from "./browser.js";
import logger from "./logger.js";

const log = debug(`${process.env.APP_NAME}:utils.ts`);

let aiCallCount = 0;
export function logAiCall(prompt: string) {
	aiCallCount++;
	log(`AI model called ${aiCallCount} times. Prompt: ${prompt.slice(0, 55)}...`);
}

export async function generateJSONResponseFromModel(prompt: string) {
	const result = await model.generateContent(prompt);
	logAiCall(prompt);
	const response = await result.response;

	const text = response.text();

	const cleanedString = text
		.replace(/^```json\n/, "")
		.replace(/\n```$/, "")
		.trim();

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

export function constructFullUrl(
	rawHref: string | undefined,
	targetPage: PageToScrape,
): string | undefined {
	if (rawHref === "") return targetPage.url;

	if (!rawHref) return undefined;

	// If it's already a full URL, ensure it uses HTTPS
	if (rawHref.startsWith("http://") || rawHref.startsWith("https://")) {
		return rawHref.replace(/^http:/, "https:");
	}

	// Remove query parameters and hash from the base URL
	const baseUrl = targetPage.url.split(/[?#]/)[0];

	// Remove trailing slashes from the base URL and leading slashes from the path
	const trimmedBaseUrl = baseUrl.replace(/\/+$/, "");
	const trimmedPath = rawHref.replace(/^\/+/, "");

	// Split the base URL and path into parts
	const baseUrlParts = trimmedBaseUrl.split("/");
	const pathParts = trimmedPath.split("/");

	// Remove the file part from the base URL if it exists
	if (
		baseUrlParts.length > 3 &&
		!baseUrlParts[baseUrlParts.length - 1].includes(".")
	) {
		baseUrlParts.pop();
	}

	// Process the path parts, handling ".." and "."
	const resultParts = [...baseUrlParts];
	for (const part of pathParts) {
		if (part === "..") {
			if (resultParts.length > 3) {
				resultParts.pop();
			}
		} else if (part !== ".") {
			resultParts.push(part);
		}
	}

	// Combine the parts back into a full URL
	return resultParts.join("/");
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
	// Replace newlines with spaces and remove extra spaces
	const trimmedDescription = description.replace(/\s+/g, " ").trim();

	const words = trimmedDescription.split(/\s+/);

	// Remove trailing punctuation from each word
	const cleanWords = words
		.map((word) => word.replace(/(?<!\()[\p{P}]+(?<!\))$/u, ""))
		.filter((word) => word.length > 0);

	// If no words remain after cleaning, return an empty string
	if (cleanWords.length === 0) {
		return "";
	}

	// Slice to max length
	const truncatedArr = cleanWords.slice(0, DESCRIPTION_MAX_LENGTH);

	// Join words
	const truncatedStr = truncatedArr.join(" ");

	// Add ellipsis if truncated, but only if it's not exactly at the word boundary
	if (
		cleanWords.length !== truncatedArr.length &&
		truncatedArr.length === DESCRIPTION_MAX_LENGTH
	) {
		return `${truncatedStr.trim()}...`;
	}

	return truncatedStr.trim().endsWith(".") ? truncatedStr : `${truncatedStr}.`;
}

export async function fetchPageContent(url: string): Promise<string> {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			logger.error(`HTTP error! Status: ${response.status}`, { url });
			throw new Error(`HTTP error! Status: ${response.status}`);
		}
		return await response.text();
	} catch (error) {
		const browser = await getBrowser();
		const page = await browser.newPage();

		try {
			await page.goto(url, { waitUntil: "networkidle2" });
			return await page.content();
		} catch (error) {
			logger.error("Error in fetchPageContent:", { error });
			throw error;
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

export async function checkRobotsTxtPermission(targetUrl: string) {
	try {
		const robotsTxtUrl = new URL("/robots.txt", targetUrl).toString();
		const response = await retry(() =>
			fetch(robotsTxtUrl, {
				redirect: "follow",
			}),
		);

		if (!response || !response.ok) {
			logger.warn(
				`Failed to fetch robots.txt: ${response?.status} ${response?.statusText}`,
			);
			return true; // Assume scraping is allowed if robots.txt can't be fetched
		}

		const robotsTxtContent = await response.text();

		// @ts-ignore
		const robotsRules = robotsParser(targetUrl, robotsTxtContent);

		return robotsRules.isAllowed(targetUrl);
	} catch (error) {
		logger.error(
			"Error in checkRobotsTxtPermission for URL:",
			targetUrl,
			"Error:",
			error,
		);
		return false; // Assume scraping is not allowed if there's an error
	}
}

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

export const extractTextContent = (
	$: cheerio.CheerioAPI,
	element: cheerio.AnyNode,
	selector: string | undefined,
): string | undefined =>
	$(element).find(selector).length
		? $(element).find(selector).text().trim()
		: undefined;

export const extractDate = (
	$: cheerio.CheerioAPI,
	element: cheerio.AnyNode,
	selector: string | undefined,
): Date | undefined =>
	$(element).find(selector).length
		? new Date($(element).find(selector).text().trim())
		: undefined;
