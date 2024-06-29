import "dotenv/config";

import debug from "debug";
import puppeteer from "puppeteer";
import { promises as fs } from "node:fs";

import { APP_NAME, SPECIFIC_PAGES,  } from "./constants";
import { initializeGenAI } from "./ai";

import responseJson from "../response.json" assert { type: "json" };
import resultsJson from "../results.json" assert { type: "json" };
import { fetchArticles } from "./data-fetching";
import { filterRelevantArticles } from "./date-filtering";

const log = debug(`${APP_NAME}:index.ts`);

export const model = initializeGenAI();

// TODO add new results
async function main() {
	runWeekly(async () => {
		const browser = await puppeteer.launch();
		try {
			const browserPage = await browser.newPage();

			const results = [];
			for (const page of SPECIFIC_PAGES) {
				const articleLinks = await fetchArticles(page, browserPage);

				if (!articleLinks.length) continue;

				// TODO add something to filter out articles that ai says are irrelevant
				const relevantArticles = await filterRelevantArticles(articleLinks, page);

				results.push(...relevantArticles);
			}

			log(results.length);
			fs.writeFile("response.json", JSON.stringify(results, null, 2));

			// TODO once above is done - move to new func and just use the json file to test ranking etc
			// TODO rank articles - now actually on article page
			// select n most relevant articles - use ai to rank

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

// TODO commits

// TODO add new results to main

// TODO filter out irrelevant articles

// TODO rank articles

main();

function runWeekly(cb: () => void) {
	// TODO
	cb();
}

// "You are a homecare business operator. You are tasked with choosing which articles to include in a newsletter. You will be provided with a list of about 200 articles and their metadata. Your job is to filter out articles that are not relevant to the topic of home health. You should reduce the list to the 30 most relevant and interesting articles. Please order the articles by relevance score, with the highest score being the first in the list. Return the filtered list of articles as a JSON array.",

// async function rankArticle(content: string, topic: string): Promise<number> {
// 	const response = await openai.chat.completions.create({
// 		model: "gpt-3.5-turbo",
// 		messages: [
// 			{
// 				role: "system",
// 				content:
// 					"You are an AI assistant that ranks articles based on their relevance and quality in relation to a given topic. Provide a score from 0 to 10, where 10 is the most relevant and highest quality.",
// 			},
// 			{
// 				role: "user",
// 				content: `Topic: ${topic}\n\nArticle content: ${content}\n\nPlease provide a relevance and quality score for this article.`,
// 			},
// 		],
// 		max_tokens: 1,
// 	});

// 	return Number.parseInt(response.choices[0].message.content || "0");
// }

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
