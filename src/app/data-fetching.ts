import * as cheerio from "cheerio";
import debug from "debug";
import type { Page } from "puppeteer";

import { SPECIFIC_PAGES } from "../lib/constants.js";
import { searchNews } from "../lib/google-search.js";
import {
	checkRobotsTxtPermission,
	constructFullUrl,
	extractDate,
	extractTextContent,
	fetchPageContent,
	retry,
} from "../lib/utils.js";
import type {
	ArticleData,
	PageToScrape,
	ValidArticleData,
} from "../types/index.js";
import { filterArticlesByPage } from "./data-filtering.js";

const log = debug(`${process.env.APP_NAME}:web-scraper.ts`);

export async function getArticleData(pags: PageToScrape[], browserPage: Page) {
	const results: ValidArticleData[] = [];
	// specific pages
	for (const page of SPECIFIC_PAGES) {
		const articleLinks = await scrapeArticles(page, browserPage);
		const relevantArticles = await filterArticlesByPage(articleLinks, page);
		results.push(...relevantArticles);
	}

	// google search
	const googleSearchResults = await searchNews([
		"homecare news medical",
		"home health news medical",
		"home care news medical",
	]);

	results.push(...googleSearchResults);

	if (results.length === 0) {
		throw new Error("No valid articles found");
	}

	// await writeTestData("raw-article-data.json", results);
	log("raw articles generated", results.length);

	return results;
}

export async function scrapeArticles(
	targetPage: PageToScrape,
	browserInstance: Page,
) {
	try {
		const isScrapingAllowed = await checkRobotsTxtPermission(targetPage.url);
		if (!isScrapingAllowed) {
			log(`Scraping disallowed by robots.txt for ${targetPage.url}`);
			return [];
		}

		const pageContent = await retry(() =>
			fetchPageContent(targetPage.url, browserInstance),
		);

		if (!pageContent) {
			log("Page content is empty");
			return [];
		}

		const $ = cheerio.load(pageContent);

		return $(targetPage.articleContainerSelector)
			.map((_, element) => extractArticleData({ targetPage, $, element }))
			.get() as ArticleData[];
	} catch (error) {
		console.error("Error in scrapeArticles:", error);
		return [];
	}
}

interface ArticleExtractionParams {
	targetPage: PageToScrape;
	$: cheerio.CheerioAPI;
	element: cheerio.AnyNode;
}

export function extractArticleData({
	targetPage,
	$,
	element,
}: ArticleExtractionParams) {
	const rawHref = $(element).find(targetPage.linkSelector).attr("href");

	return {
		url: targetPage.url,
		link: constructFullUrl(rawHref, targetPage),
		title: extractTextContent($, element, targetPage.titleSelector),
		description: extractTextContent($, element, targetPage.descriptionSelector),
		date: extractDate($, element, targetPage.dateSelector),
	};
}
