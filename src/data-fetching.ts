import * as cheerio from "cheerio";
import Bottleneck from "bottleneck";
import robotsParser from "robots-parser";
import type { Page } from "puppeteer";
import debug from "debug";
import { promises as fs } from "node:fs";

import { APP_NAME, RECURRING_FREQUENCY } from "./constants";
import type { ArticleData, PageToScrape } from "../types";

const log = debug(`${APP_NAME}:data-fetching.ts`);

export async function fetchArticles(page: PageToScrape, browserPage: Page) {
	try {
		const isScrapeable = await canScrape(page.url);
		if (!isScrapeable) {
			// TODO: handle error
			log("can't scrape");
			return [];
		}

		const html = await fetchPageHTML(page, browserPage);

		const $ = cheerio.load(html);

		return $(page.articleContainerSelector)
			.map((_, el) => ({
				url: page.url,
				link: $(el).find(page.linkSelector).attr("href"),
				title: $(el).find(page.titleSelector).length
					? $(el).find(page.titleSelector).text().trim()
					: undefined,
				description: $(el).find(page.descriptionSelector).length
					? $(el).find(page.descriptionSelector).text().trim()
					: undefined,
				date: $(el).find(page.dateSelector).length
					? new Date($(el).find(page.dateSelector).text().trim())
					: undefined,
			}))
			.get() as ArticleData[];
	} catch (error) {
		console.error("Error in fetchArticleLinksAndDates:", error);
		return [];
	}
}

async function canScrape(pageToScrape: string) {
	try {
		const robotsUrl = new URL("/robots.txt", pageToScrape).toString();
		const response = await fetch(robotsUrl, {
			redirect: "follow",
		});

		if (!response.ok) {
			console.warn(
				`Couldn't fetch robots.txt: ${response.status} ${response.statusText}`,
			);
			return true; // Assume scraping is allowed if we can't fetch robots.txt
		}

		const robotsTxt = await response.text();
		const robots = robotsParser(pageToScrape, robotsTxt);

		return robots.isAllowed(pageToScrape);
	} catch (error) {
		console.error("Error in canScrape on page:", pageToScrape, "error:", error);
		return false; // Assume scraping is not allowed if there's an error
	}
}

async function fetchPageHTML(page: PageToScrape, browserPage: Page) {
	try {
		if (page.type === "client") {
			await browserPage.goto(page.url);
			return await browserPage.content();
		}

		const response = await fetch(page.url);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		return await response.text();
	} catch (error) {
		console.error("Error in fetchPageHTML:", error);
		throw error;
	}
}

//
//
//

const limiter = new Bottleneck({
	minTime: 2000, // Minimum time between requests (2 seconds)
	maxConcurrent: 1, // Ensures only one job runs at a time
});

// export async function scrapeWithRetryAndDelay(
// 	page: PageToScrape,
// 	scrapeFunction: (page: PageToScrape) => Promise<any>,
// 	maxRetries = 3,
// ) {
// 	for (let i = 0; i < maxRetries; i++) {
// 		try {
// 			return await limiter.schedule(() => scrapeFunction(page));
// 		} catch (error) {
// 			console.error(`Attempt ${i + 1} failed for ${page.url}: ${error}`);

// 			if (i === maxRetries - 1) {
// 				console.error(`All ${maxRetries} attempts failed for ${page.url}`);
// 				return {
// 					url: page.url,
// 					data: undefined,
// 					error: `Failed after ${maxRetries} attempts`,
// 				};
// 			}
// 		}
// 	}
// }
