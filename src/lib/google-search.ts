import debug from "debug";
import { google } from "googleapis";
import type { Browser, Page } from "puppeteer";
import { getNewsletterFrequency } from "../api/service.js";
import { createDescriptionPrompt } from "../app/format-articles.js";
import type { ArticleData, ValidArticleData } from "../types/index.js";
import { getBrowser } from "./browser.js";
import { rateLimiter } from "./rate-limit.js";
import {
	generateJSONResponseFromModel,
	getRecurringFrequency,
	retry,
} from "./utils.js";

const log = debug(`${process.env.APP_NAME}:google-search.ts`);
const debugLog = debug(`debug:${process.env.APP_NAME}:google-search.ts`);

const customsearch = google.customsearch("v1");

const BLACKLISTED_DOMAINS = [
	"https://news.google.com",
	"https://nahc.com",
	"https://www.nejm.org",
	"https://homehealthcarenews.com",
];

export async function getLastDateQuery(
	q: string,
	customFrequency?: number,
): Promise<string> {
	try {
		let beforeMs: number;

		if (customFrequency !== undefined) {
			beforeMs = customFrequency;
		} else {
			const frequencyWeeks = await getNewsletterFrequency();
			beforeMs = getRecurringFrequency(frequencyWeeks);
		}

		const pastDate = new Date().getTime() - beforeMs;
		const formattedPastDate = new Date(pastDate).toISOString().split("T")[0];

		return `${q} after:${formattedPastDate}`;
	} catch (error) {
		log(`Error in getLastDateQuery: ${error}`);

		// Fallback to a default of 1 week if there's an error
		const oneWeekAgo = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000);
		const formattedOneWeekAgo = oneWeekAgo.toISOString().split("T")[0];

		return `${q} after:${formattedOneWeekAgo}`;
	}
}

async function getPageUrl(
	page: Page,
	url: string,
): Promise<{
	content: string;
	url: URL;
} | null> {
	try {
		const response = await page.goto(url, {
			waitUntil: "networkidle0",
		});

		if (!response?.ok) {
			return null;
		}

		const content = await page.content();

		return { content, url: new URL(page.url()) };
	} catch (error) {
		debugLog(`Error navigating to url: ${error}`);
		return null;
	}
}

let num = 0;
export async function searchNews(
	qs: string[],
	pages = 1,
): Promise<ValidArticleData[]> {
	const allResults: ArticleData[] = [];
	let browser: Browser | null = null;

	try {
		browser = await getBrowser();
		const page = await browser.newPage();

		for (const q of qs) {
			for (let i = 0; i < pages; i++) {
				const startIndex = i * 10 + 1;
				try {
					const query = await getLastDateQuery(q);
					const res = await retry(() => {
						return customsearch.cse.list({
							cx: process.env.CUSTOM_ENGINE_ID,
							auth: process.env.CUSTOM_SEARCH_API_KEY,
							q: query,
							start: startIndex,
						});
					});

					if (!res?.data.items) {
						log(`No results found for query: ${q}`);
						continue;
					}

					if (!res?.data.items.length) {
						log(`No results found for query: ${q}`);
						throw new Error("No results found for query");
					}

					num = num + res.data.items.length;

					for (const item of res.data.items) {
						if (!item.link) {
							continue;
						}

						const pageData = await getPageUrl(page, item.link);

						if (!pageData) {
							continue;
						}

						const { content, url } = pageData;

						const origin = url?.origin;

						const isBlacklisted = BLACKLISTED_DOMAINS.some((blacklisted) => {
							return origin.includes(blacklisted);
						});

						if (isBlacklisted) {
							log(`Blacklisted domain: ${origin}`);
							continue;
						}

						const descriptionPrompt = createDescriptionPrompt(content);
						const generatedDescription = await rateLimiter.schedule(() =>
							retry(() => generateJSONResponseFromModel(descriptionPrompt)),
						);

						const description = generatedDescription?.trim();

						allResults.push({
							title: item.title,
							link: origin,
							description: description,
							snippet: item.snippet,
						});
					}
				} catch (error) {
					log(`Error searching for query "${q}": ${error}`);
				}
			}
		}
	} catch (error) {
		log(`Error in searchNews: ${error}`);
	} finally {
		if (browser) {
			await browser.close();
		}
	}

	const validResults = allResults.filter(
		(article): article is ValidArticleData => !!article.link && !!article.title,
	);

	log(
		`Found ${validResults.length} valid results out of ${allResults.length} total results`,
	);
	return validResults;
}

export async function safeSingleSearch(q: string): Promise<ValidArticleData[]> {
	try {
		const results = await searchNews([q]);
		return results;
	} catch (error) {
		log(`Error in safeSingleSearch for query "${q}": ${error}`);
		return [];
	}
}
