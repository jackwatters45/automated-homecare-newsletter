import debug from "debug";
import { google } from "googleapis";
import type { Browser, Page } from "puppeteer";

import {
	getAllBlacklistedDomainNames,
	getNewsletterFrequency,
} from "../api/service.js";

import type {
	ArticleWithOptionalSource,
	ArticleWithSnippet,
	BaseArticle,
} from "../types/index.js";
import { closeBrowser, getBrowser } from "./browser.js";
import { JOB_RELATED_URL_PATTERNS, REDIRECT_URLS } from "./constants.js";
import { handleError } from "./errorHandler.js";
import { AppError, NetworkError, NotFoundError } from "./errors.js";
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
		if (!browser) throw new AppError("Browser not found");

		const page = await browser.newPage();
		if (!page) throw new AppError("Unable to create page");

		for (const q of qs) {
			for (let i = 0; i < pages; i++) {
				const searchTermWithDate = generateSearchTerm(q);
				const startIndex = i * 10 + 1;
				try {
					const res = await retry(() => {
						return customsearch.cse.list({
							cx: process.env.CUSTOM_ENGINE_ID,
							auth: process.env.CUSTOM_SEARCH_API_KEY,
							q: searchTermWithDate,
							start: startIndex,
							dateRestrict: "d7",
							cr: "countryUS",
						});
					});

					if (!res?.data.items?.length) {
						throw new NotFoundError(`No results found for query: ${q}`);
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

						const isJobRelated = JOB_RELATED_URL_PATTERNS.some((pattern) =>
							finalUrl.toString().toLowerCase().includes(pattern),
						);

						if (isJobRelated) {
							log(`Job-related URL: ${finalUrl.origin}`);
							continue;
						}

						const blacklistedDomains = await getAllBlacklistedDomainNames();
						const isBlacklisted = blacklistedDomains.some((blacklisted) => {
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
		handleError(
			new NetworkError("Failed to search news", { cause: error, query: qs }),
		);
		throw error;
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

function filterOutJobUrls(
	articles: ArticleWithOptionalSource[],
): ArticleWithOptionalSource[] {
	return articles.filter(
		(article) =>
			!JOB_RELATED_URL_PATTERNS.some((pattern) =>
				article.link.toLowerCase().includes(pattern),
			),
	);
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

function getCurrentMonth(): string {
	const now = new Date();
	const options = { month: "long" } as Intl.DateTimeFormatOptions;
	return new Intl.DateTimeFormat("en-US", options).format(now);
}

function generateSearchTerm(baseTerm: string): string {
	const month = getCurrentMonth();
	return `${baseTerm} ${month}`;
}

export async function simpleSearch(query: string, pages = 1): Promise<void> {
	try {
		const searchResults = [];
		for (let i = 0; i < pages; i++) {
			const page = await customsearch.cse.list({
				cx: process.env.CUSTOM_ENGINE_ID,
				auth: process.env.CUSTOM_SEARCH_API_KEY,
				q: query,
				dateRestrict: "d7",
				cr: "countryUS",
				start: i * 10 + 1,
			});

			searchResults.push(...(page.data.items ?? []));
		}

		if (!searchResults?.length) {
			log(`No results found for query: ${query}`);
			return;
		}

		log(`Results for query: ${query}`);
		searchResults.forEach((item, index) => {
			log(`${index + 1}. ${item.title}`);
		});
		log("\n");
	} catch (error) {
		log(`Error searching for query "${query}": ${error}`);
	}
}
