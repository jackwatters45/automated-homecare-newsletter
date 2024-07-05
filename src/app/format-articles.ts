import Bottleneck from "bottleneck";
import * as cheerio from "cheerio";
import debug from "debug";
import type { Page } from "puppeteer";

import { DESCRIPTION_MAX_LENGTH } from "@/lib/constants";
import {
	fetchPageContent,
	generateStringResponse,
	retry,
	truncateDescription,
} from "@/lib/utils";
import type { ArticleDisplayData, ValidArticleData } from "@/types";

const logger = debug(`${process.env.APP_NAME}:article-processor.ts`);

const rateLimiter = new Bottleneck({
	maxConcurrent: 10,
	minTime: 2500,
});

const enrichArticleData = async (
	articleData: ValidArticleData,
	browserInstance: Page,
): Promise<ArticleDisplayData> => {
	try {
		if (articleData.description) {
			return {
				title: articleData.title,
				link: articleData.link,
				description: truncateDescription(articleData.description),
			};
		}

		const pageContent = await retry(() =>
			fetchPageContent(articleData.link, browserInstance),
		);

		if (!pageContent)
			return { title: articleData.title, link: articleData.link, description: "" };

		const $ = cheerio.load(pageContent);

		const fullArticleText = $("body").text();

		const descriptionPrompt = createDescriptionPrompt(fullArticleText);

		const generatedDescription = await retry(() =>
			generateStringResponse(descriptionPrompt),
		);

		if (!generatedDescription)
			return { title: articleData.title, link: articleData.link, description: "" };

		return {
			title: articleData.title,
			link: articleData.link,
			description: truncateDescription(generatedDescription),
		};
	} catch (error) {
		logger(`Error enriching article ${articleData.link}: ${error}`);
		return {
			title: articleData.title,
			link: articleData.link,
			description: "Unable to generate description due to an error.",
		};
	}
};

function createDescriptionPrompt(articleText: string): string {
	return `Generate a subtitle description for the following article:

    ${articleText}
    
    Requirements:
    - The subtitle should be a single sentence of no more than ${DESCRIPTION_MAX_LENGTH} words
    - Capture the essence of the article without repeating the title
    - Highlight a key insight, finding, or angle of the article
    - Use engaging language that complements the title
    - Assume the reader has basic familiarity with the topic
    - Do not use colons or semicolons`;
}

export const enrichArticlesData = async (
	prioritizedArticles: ValidArticleData[],
	browserInstance: Page,
): Promise<ArticleDisplayData[]> => {
	try {
		const enrichedArticles = await Promise.all(
			prioritizedArticles.map((article) =>
				rateLimiter.schedule(() => enrichArticleData(article, browserInstance)),
			),
		);

		logger(`Enriched ${enrichedArticles.length} articles successfully`);
		return enrichedArticles;
	} catch (error) {
		logger(`Error in enrichArticlesData: ${error}`);
		return [];
	}
};
