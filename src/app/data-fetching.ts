import * as cheerio from "cheerio";
import debug from "debug";
import type { Page } from "puppeteer";
import robotsParser from "robots-parser";

import {
	constructFullUrl,
	ensureHttps,
	fetchPageContent,
	retry,
} from "@/lib/utils";
import type { ArticleData, PageToScrape } from "@/types";

const logger = debug(`${process.env.APP_NAME}:web-scraper.ts`);

export async function scrapeArticles(
	targetPage: PageToScrape,
	browserInstance: Page,
) {
	try {
		const isScrapingAllowed = await checkRobotsTxtPermission(targetPage.url);
		if (!isScrapingAllowed) {
			logger(`Scraping disallowed by robots.txt for ${targetPage.url}`);
			return [];
		}

		const pageContent = await retry(() =>
			fetchPageContent(targetPage.url, browserInstance),
		);

		if (!pageContent) {
			logger("Page content is empty");
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

function extractArticleData({
	targetPage,
	$,
	element,
}: ArticleExtractionParams) {
	const rawHref = $(element).find(targetPage.linkSelector).attr("href");

	let fullUrl = rawHref ? ensureHttps(rawHref) : undefined;
	if (!fullUrl?.startsWith("https://"))
		fullUrl = constructFullUrl(targetPage.url, fullUrl);

	return {
		url: targetPage.url,
		link: fullUrl,
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

async function checkRobotsTxtPermission(targetUrl: string) {
	try {
		const robotsTxtUrl = new URL("/robots.txt", targetUrl).toString();
		const response = await retry(() =>
			fetch(robotsTxtUrl, {
				redirect: "follow",
			}),
		);

		if (!response || !response.ok) {
			console.warn(
				`Failed to fetch robots.txt: ${response?.status} ${response?.statusText}`,
			);
			return true; // Assume scraping is allowed if robots.txt can't be fetched
		}

		const robotsTxtContent = await response.text();
		const robotsRules = robotsParser(targetUrl, robotsTxtContent);

		return robotsRules.isAllowed(targetUrl);
	} catch (error) {
		console.error(
			"Error in checkRobotsTxtPermission for URL:",
			targetUrl,
			"Error:",
			error,
		);
		return false; // Assume scraping is not allowed if there's an error
	}
}
