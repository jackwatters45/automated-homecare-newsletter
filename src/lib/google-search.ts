import debug from "debug";
import { google } from "googleapis";
import type { Browser, Page } from "puppeteer";
import { createDescriptionPrompt } from "../app/format-articles.js";
import type { ArticleData, ValidArticleData } from "../types/index.js";
import { getBrowser } from "./browser.js";
import { RECURRING_FREQUENCY } from "./constants.js";
import { rateLimiter } from "./rate-limit.js";
import { generateJSONResponseFromModel, retry } from "./utils.js";

const log = debug(`${process.env.APP_NAME}:google-search.ts`);
const customsearch = google.customsearch("v1");
const BLACKLISTED_DOMAINS = ["https://nahc.com", "https://www.nejm.org"];

export function getLastDateQuery(
	q: string,
	beforeMs = RECURRING_FREQUENCY,
): string {
	try {
		const pastDate = new Date().getTime() - beforeMs;
		const formattedPastDate = new Date(pastDate).toISOString().split("T")[0];
		return `${q} after:${formattedPastDate}`;
	} catch (error) {
		log(`Error in getLastDateQuery: ${error}`);
		return q;
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
		const response = await page.goto(url, { waitUntil: "networkidle0" });

		if (!response?.ok) {
			log(
				`Error navigating to ${url}: ${response?.status} ${response?.statusText}`,
			);
			return null;
		}

		const content = await page.content();

		return { content, url: new URL(page.url()) };
	} catch (error) {
		log(`Error navigating to ${url}: ${error}`);
		return null;
	}
}

export async function searchNews(qs: string[]): Promise<ValidArticleData[]> {
	const allResults: ArticleData[] = [];
	let browser: Browser | null = null;

	try {
		browser = await getBrowser();
		const page = await browser.newPage();

		for (const q of qs) {
			for (let i = 0; i < 3; i++) {
				const startIndex = i * 10 + 1;
				try {
					const res = await retry(() => {
						return customsearch.cse.list({
							cx: process.env.CUSTOM_ENGINE_ID,
							auth: process.env.CUSTOM_SEARCH_API_KEY,
							q: getLastDateQuery(q),
							start: startIndex,
						});
					});

					if (!res?.data.items) {
						log(`No results found for query: ${q}`);
						continue;
					}

					for (const item of res.data.items) {
						if (!item.link) continue;

						const pageData = await getPageUrl(page, item.link);

						if (!pageData) continue;

						const { content, url } = pageData;

						const origin = url?.origin;

						if (origin?.includes("https://news.google.com") || !origin) {
							continue;
						}

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
