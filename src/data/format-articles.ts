import Bottleneck from "bottleneck";
import * as cheerio from "cheerio";
import debug from "debug";
import type { Page } from "puppeteer";

import { DESCRIPTION_MAX_LENGTH } from "@/lib/constants";
import type { ArticleDisplayData, ValidArticleData } from "../../types";
import {
	formatDescription,
	generateStringResponse,
	retry,
	tryFetchPageHTML,
} from "../lib/utils";

const log = debug(`${process.env.APP_NAME}:format-articles.ts`);

const limiter = new Bottleneck({
	maxConcurrent: 10,
	minTime: 2500,
});

const processArticle = async (
	article: ValidArticleData,
	browserPage: Page,
): Promise<ArticleDisplayData> => {
	try {
		if (article.description) {
			return {
				title: article.title,
				link: article.link,
				description: formatDescription(article.description),
			};
		}

		const html = await retry(() => tryFetchPageHTML(article.link, browserPage));

		if (!html)
			return { title: article.title, link: article.link, description: "" };

		const $ = cheerio.load(html);

		const articleBody = $("body").text();

		const prompt = `Generate a subtitle description for the following article:

		${articleBody}
		
		Requirements:
		- The subtitle should be a single sentence of no more than ${DESCRIPTION_MAX_LENGTH} words
		- Capture the essence of the article without repeating the title
		- Highlight a key insight, finding, or angle of the article
		- Use engaging language that complements the title
		- Assume the reader has basic familiarity with the topic
		- Do not use colons or semicolons`;

		const articleDescription = await retry(() => generateStringResponse(prompt));

		if (!articleDescription)
			return { title: article.title, link: article.link, description: "" };

		return {
			title: article.title,
			link: article.link,
			description: formatDescription(articleDescription),
		};
	} catch (error) {
		log(`Error processing article ${article.link}: ${error}`);
		// Return a default object if processing fails
		return {
			title: article.title,
			link: article.link,
			description: "Unable to generate description due to an error.",
		};
	}
};

export const processArticles = async (
	rankedArticles: ValidArticleData[],
	browserPage: Page,
): Promise<ArticleDisplayData[]> => {
	try {
		const results = await Promise.all(
			rankedArticles.map((article) =>
				limiter.schedule(() => processArticle(article, browserPage)),
			),
		);

		log(`Processed ${results.length} articles successfully`);
		return results;
	} catch (error) {
		log(`Error in processArticles: ${error}`);
		// If the entire process fails, return an empty array
		return [];
	}
};
