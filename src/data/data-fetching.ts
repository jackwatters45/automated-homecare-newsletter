import Bottleneck from "bottleneck";
import * as cheerio from "cheerio";
import debug from "debug";
import type { Page } from "puppeteer";
import robotsParser from "robots-parser";

import type { ArticleData, PageToScrape } from "../../types";
import {
	combineUrlParts,
	convertHttpToHttps,
	tryFetchPageHTML,
} from "../lib/utils";

const log = debug(`${process.env.APP_NAME}:data-fetching.ts`);

export async function fetchArticles(page: PageToScrape, browserPage: Page) {
	try {
		const isScrapeable = await canScrape(page.url);
		if (!isScrapeable) {
			// TODO: handle error
			log("can't scrape");
			return [];
		}

		const html = await tryFetchPageHTML(page.url, browserPage);
		const $ = cheerio.load(html);

		return $(page.articleContainerSelector)
			.map((_, el) => getArticlePreview({ page, $, el }))
			.get() as ArticleData[];
	} catch (error) {
		console.error("Error in fetchArticleLinksAndDates:", error);
		return [];
	}
}

interface GetArticlePreviewParams {
	page: PageToScrape;
	$: cheerio.CheerioAPI;
	el: cheerio.AnyNode;
}

function getArticlePreview({ page, $, el }: GetArticlePreviewParams) {
	const href = $(el).find(page.linkSelector).attr("href");

	let link = href ? convertHttpToHttps(href) : undefined;
	if (!link?.startsWith("https://")) link = combineUrlParts(page.url, link);

	return {
		url: page.url,
		link,
		title: $(el).find(page.titleSelector).length
			? $(el).find(page.titleSelector).text().trim()
			: undefined,
		description: $(el).find(page.descriptionSelector).length
			? $(el).find(page.descriptionSelector).text().trim()
			: undefined,
		date: $(el).find(page.dateSelector).length
			? new Date($(el).find(page.dateSelector).text().trim())
			: undefined,
	};
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
