import debug from "debug";
import { google } from "googleapis";
import type { Browser, Page } from "puppeteer";

import { getNewsletterFrequency } from "../api/service.js";

import type { ArticleWithSnippet, BaseArticle } from "../types/index.js";
import { closeBrowser, getBrowser } from "./browser.js";
import { BLACKLISTED_DOMAINS, REDIRECT_URLS } from "./constants.js";
import { getRecurringFrequency, retry } from "./utils.js";

const log = debug(`${process.env.APP_NAME}:google-search.ts`);
const debugLog = debug(`debug:${process.env.APP_NAME}:google-search.ts`);

const customsearch = google.customsearch("v1");

export async function searchNews(
	qs: string[],
	pages = 1,
): Promise<ArticleWithSnippet[]> {
	const allResults: ArticleWithSnippet[] = [];
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
							dateRestrict: "d7",
							sort: "date",
							cr: "countryUS",
							gl: "us",
							hl: "en",
						});
					});

					if (!res?.data.items?.length) {
						log(`No results found for query: ${q}`);
						throw new Error("No results found for query");
					}

					for (const item of res.data.items) {
						const link = item.link;
						if (!link) continue;

						const urlpage = new URL(link);
						if (!(urlpage.pathname.length > 1) && urlpage.pathname.endsWith("/")) {
							continue;
						}

						let finalUrl = new URL(link);
						if (REDIRECT_URLS.includes(finalUrl.origin)) {
							const url = await getPageUrl(page, link);
							if (!url) continue;
							finalUrl = url;
						}

						const isBlacklisted = BLACKLISTED_DOMAINS.some((blacklisted) => {
							return finalUrl.origin.includes(blacklisted);
						});

						if (isBlacklisted) {
							log(`Blacklisted domain: ${finalUrl.origin}`);
							continue;
						}

						const title = item.title;
						if (!title) {
							log(`No title found for query: ${q}`);
							continue;
						}

						const snippet = item.snippet;
						if (!snippet) {
							log(`No snippet found for query: ${q}`);
							continue;
						}

						allResults.push({
							title: title,
							link: finalUrl.href,
							description: "",
							snippet: snippet,
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
			await closeBrowser();
		}
	}

	const validResults = allResults.filter(
		(article): article is ArticleWithSnippet => !!article.link && !!article.title,
	);

	log(
		`Found ${validResults.length} valid results out of ${allResults.length} total results`,
	);

	return validResults;
}

async function getPageUrl(page: Page, url: string): Promise<URL | null> {
	try {
		const response = await page.goto(url, {
			waitUntil: "networkidle0",
		});

		if (!response?.ok) {
			return null;
		}

		return new URL(response.url());
	} catch (error) {
		debugLog(`Error navigating to url: ${error}`);
		return null;
	}
}
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

export async function safeSingleSearch(q: string): Promise<BaseArticle[]> {
	try {
		const results = await searchNews([q]);
		return results;
	} catch (error) {
		log(`Error in safeSingleSearch for query "${q}": ${error}`);
		return [];
	}
}
