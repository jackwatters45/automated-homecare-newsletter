import Bottleneck from "bottleneck";
import * as cheerio from "cheerio";
import type { Page } from "puppeteer";

import type { ArticleDisplayData, ValidArticleData } from "../types";
import { tryFetchPageHTML } from "./data-fetching";
import { formatDescription, generateStringResponse } from "./utils";

const limiter = new Bottleneck({
	maxConcurrent: 5, // Adjust this number based on your needs
	minTime: 1000, // Minimum time between operations in milliseconds
});

export const processArticles = async (
	rankedArticles: ValidArticleData[],
	browserPage: Page,
): Promise<ArticleDisplayData[]> => {
	const processArticle = async (article: ValidArticleData) => {
		if (article.description) {
			return {
				title: article.title,
				link: article.link,
				description: formatDescription(article.description),
			};
		}

		const html = await tryFetchPageHTML(article.link, browserPage);
		const $ = cheerio.load(html);

		const articleBody = $("body").text();

		const prompt = `return a description of the following article: ${articleBody}. It should be a short description of the article, not the entire article. The description should be no more than 30 words and not the same as the title. Do not explain the article or any topics. Assume the reader is knowledgeable about the topic. `;

		const articleDescription = await generateStringResponse(prompt);

		return {
			title: article.title,
			link: article.link,
			description: formatDescription(articleDescription),
		};
	};

	const results = await Promise.all(
		rankedArticles.map((article) =>
			limiter.schedule(() => processArticle(article)),
		),
	);

	return results;
};
