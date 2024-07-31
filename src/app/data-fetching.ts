import * as cheerio from "cheerio";
import debug from "debug";

import { SPECIFIC_PAGES } from "../lib/constants.js";
import { searchNews } from "../lib/google-search.js";
import logger from "../lib/logger.js";
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

export async function getArticleData() {
	const results: ValidArticleData[] = [];

	// google search
	const googleSearchResults = await searchNews([
		"homecare news medical",
		"home health news medical",
		"home care news medical",
	]);

	results.push(...googleSearchResults);

	// specific pages
	for (const page of SPECIFIC_PAGES) {
		const articleLinks = await scrapeArticles(page);
		const relevantArticles = await filterArticlesByPage(articleLinks, page);
		results.push(...relevantArticles);
	}

	if (results.length === 0) {
		logger.error("No valid articles found");
		throw new Error("No valid articles found");
	}

	// await writeTestData("raw-article-data.json", results);
	log("raw articles generated", results.length);

	return results;
}

export async function scrapeArticles(targetPage: PageToScrape) {
	try {
		const isScrapingAllowed = await checkRobotsTxtPermission(targetPage.url);
		if (!isScrapingAllowed) {
			log(`Scraping disallowed by robots.txt for ${targetPage.url}`);
			return [];
		}

		const pageContent = await retry(() => fetchPageContent(targetPage.url));

		if (!pageContent) {
			log("Page content is empty");
			return [];
		}

		const $ = cheerio.load(pageContent);

		return $(targetPage.articleContainerSelector)
			.map((_, element) => extractArticleData({ targetPage, $, element }))
			.get() as ArticleData[];
	} catch (error) {
		logger.error("Error in scrapeArticles:", {
			error,
			targetPage,
		});
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
