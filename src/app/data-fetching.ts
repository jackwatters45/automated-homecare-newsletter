import * as cheerio from "cheerio";
import debug from "debug";
import type { Page } from "puppeteer";
import robotsParser from "robots-parser";

import {
	checkRobotsTxtPermission,
	constructFullUrl,
	fetchPageContent,
	retry,
} from "../lib/utils.js";
import type { ArticleData, PageToScrape } from "../types/index.js";

const log = debug(`${process.env.APP_NAME}:web-scraper.ts`);

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

function extractTextContent(
	$: cheerio.CheerioAPI,
	element: cheerio.AnyNode,
	selector: string | undefined,
): string | undefined {
	return $(element).find(selector).length
		? $(element).find(selector).text().trim()
		: undefined;
}

function extractDate(
	$: cheerio.CheerioAPI,
	element: cheerio.AnyNode,
	selector: string | undefined,
): Date | undefined {
	return $(element).find(selector).length
		? new Date($(element).find(selector).text().trim())
		: undefined;
}
