// TODO commits

// TODO filtering

// TODO implement data fetching for rest

// TODO set up google api

// TODO skeleton using functions

// individual pages
// TODO actually pick which ones to use

import { fetchArticles, filterRelevantArticles } from "./utils";
import { promises as fs } from "node:fs";

import { APP_NAME, specificPages, testPages } from "./constants";
const pages = testPages;

import debug from "debug";
import puppeteer from "puppeteer";

const log = debug(`${APP_NAME}:index.ts`);

// TODO add error handling ie scrapeWithRetryAndDelay
async function main() {
	// cron job
	runWeekly(async () => {
		const browser = await puppeteer.launch();
		try {
			const browserPage = await browser.newPage();
			// loop through source pages
			const results = [];
			for (const page of pages) {
				// extract content
				// 1. get article links!
				const articleLinks = await fetchArticles(page, browserPage);

				if (!articleLinks.length) continue;

				// filter articles - still on home page
				// 1. by date
				// 2. hopefully something else so can ai less
				// 3. use ai to check if seems relevant

				//
				const relevantArticles = await filterRelevantArticles(articleLinks);

				//
				log(relevantArticles);

				//
				results.push(...relevantArticles);
			}
			log(results.length);
			fs.writeFile("results.json", JSON.stringify(results, null, 2));

			// rank articles - now actually on article page
			// 1. use ai to rank

			// select n most relevant articles

			// below still needs to be expanded on
			// add to template

			// distribute
		} catch (error) {
			console.error(error);
		} finally {
			await browser.close();
		}
	});
}

// TODO determine if a good way to group newsletter content

main();

function runWeekly(cb: () => void) {
	// TODO
	cb();
}
