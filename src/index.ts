import "dotenv/config";

import { promises as fs } from "node:fs";
import debug from "debug";
import Handlebars from "handlebars";
import puppeteer, { Page } from "puppeteer";

import type {
	ArticleDisplayData,
	ValidArticleData,
	ValidArticleDataWithCount,
} from "../types";
import { initializeGenAI } from "./ai";
import { APP_NAME, SPECIFIC_PAGES } from "./constants";

import { runWeekly } from "./cron";
import {
	formatDescription,
	generateJsonResponse,
	generateStringResponse,
	parseJsonDate,
} from "./utils";

import Bottleneck from "bottleneck";
import displayDataJson from "../article-display-data.json" assert {
	type: "json",
};
import rankedJson from "../ranked.json" assert { type: "json" };
import responseJson from "../response.json" assert { type: "json" };
import resultsJson from "../results.json" assert { type: "json" };
import { filterAllArticles, filterPageArticles } from "./date-filtering";
import { processArticles } from "./format-articles";
import { renderTemplate, sendEmail } from "./template";

const log = debug(`${APP_NAME}:index.ts`);

export const model = initializeGenAI();

// TODO add new results to main
// TODO style template

// TODO rank articles (combine with filter??)
// TODO fine tune prompts

// TODO cron job
async function main() {
	runWeekly(async () => {
		const browser = await puppeteer.launch();
		try {
			const browserPage = await browser.newPage();

			// const results = [];
			// for (const page of SPECIFIC_PAGES) {
			// 	const articleLinks = await fetchArticles(page, browserPage);

			// 	if (!articleLinks.length) continue;

			// 	const relevantArticles = await filterPageArticles(articleLinks, page);

			// 	results.push(...relevantArticles);
			// }
			// fs.writeFile("response.json", JSON.stringify(results, null, 2));

			// const relevantArticles = await filterAllArticles(results);

			// testing
			// const relevantArticles = await filterAllArticles(
			// 	parseJsonDate(responseJson),
			// );
			// fs.writeFile("results.json", JSON.stringify(relevantArticles, null, 2));

			// const parsedResultsJson = parseJsonDate(resultsJson);

			// select n most relevant articles - use ai to rank
			// const rankedArticles = await rankArticles(parsedResultsJson);

			// log(rankedArticles.length);
			// fs.writeFile("ranked.json", JSON.stringify(rankedArticles, null, 2));

			// const rankedArticles = parseJsonDate(rankedJson);

			// const articleDisplayData = await processArticles(
			// 	rankedArticles,
			// 	browserPage,
			// );

			// template

			const result = await renderTemplate(displayDataJson);

			const res = await sendEmail(result);
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
	numberOfArticles = 30,
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
