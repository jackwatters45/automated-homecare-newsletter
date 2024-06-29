import "dotenv/config";

import { promises as fs } from "node:fs";
import debug from "debug";
import puppeteer from "puppeteer";

import type { ValidArticleData, ValidArticleDataWithCount } from "../types";
import { initializeGenAI } from "./ai";
import { APP_NAME, SPECIFIC_PAGES } from "./constants";
import { fetchArticles } from "./data-fetching";

import { runWeekly } from "./cron";
import { parseJsonDate } from "./utils";

import responseJson from "../response.json" assert { type: "json" };
import resultsJson from "../results.json" assert { type: "json" };

const log = debug(`${APP_NAME}:index.ts`);

export const model = initializeGenAI();

// TODO fix categories responses ie https://hospicenews.com/category/featured/
// TODO rank articles (combine with filter??)
// TODO add new results to main
// TODO fine tune prompts
async function main() {
	runWeekly(async () => {
		const browser = await puppeteer.launch();
		try {
			// const browserPage = await browser.newPage();

			// const results = [];
			// for (const page of SPECIFIC_PAGES) {
			// 	const articleLinks = await fetchArticles(page, browserPage);

			// 	if (!articleLinks.length) continue;

			// 	const relevantArticles = await filterPageArticles(articleLinks, page);

			// 	results.push(...relevantArticles);
			// }

			// const relevantArticles = await filterAllArticles(results);

			const parsedResultsJson = parseJsonDate(resultsJson);

			// select n most relevant articles - use ai to rank
			const rankedArticles = await rankArticles(parsedResultsJson);

			log(rankedArticles.length);
			fs.writeFile("ranked.json", JSON.stringify(rankedArticles, null, 2));

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

//
function rankArticles(
	articles: ValidArticleDataWithCount[],
	numberOfArticles = 20,
	// doesnt need to omit count if it requires an extra loop
): ValidArticleDataWithCount[] {
	const sortedArticles = articles.sort((a, b) => b.count - a.count);

	// ai shite!!!

	return sortedArticles.slice(0, numberOfArticles);
}
main();

// "You are a homecare business operator. You are tasked with choosing which articles to include in a newsletter. You will be provided with a list of about 200 articles and their metadata. Your job is to filter out articles that are not relevant to the topic of home health. You should reduce the list to the 30 most relevant and interesting articles. Please order the articles by relevance score, with the highest score being the first in the list. Return the filtered list of articles as a JSON array.",

// async function analyzeAndRankArticles(
// 	articles: Article[],
// 	topic: string,
// 	numTopArticles = 10,
// ): Promise<Article[]> {
// 	const rankedArticles = await Promise.all(
// 		articles.map(async (article) => ({
// 			...article,
// 			relevanceScore: await rankArticle(article.content, topic),
// 		})),
// 	);

// 	return rankedArticles
// 		.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
// 		.slice(0, numTopArticles);
// }
