import Bottleneck from "bottleneck";
import * as cheerio from "cheerio";
import type { Page } from "puppeteer";

import { DESCRIPTION_MAX_LENGTH } from "@/lib/constants";
import type { ArticleDisplayData, ValidArticleData } from "../../types";
import {
	formatDescription,
	generateStringResponse,
	tryFetchPageHTML,
} from "../lib/utils";

const limiter = new Bottleneck({
	maxConcurrent: 10,
	minTime: 2500,
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

		const prompt = `Generate a subtitle description for the following article:

		${articleBody}
		
		Requirements:
		- The subtitle should be a single sentence of no more than ${DESCRIPTION_MAX_LENGTH} words
		- Capture the essence of the article without repeating the title
		- Highlight a key insight, finding, or angle of the article
		- Use engaging language that complements the title
		- Assume the reader has basic familiarity with the topic
		- Do not use colons or semicolons`;

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
