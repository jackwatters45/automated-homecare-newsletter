import Bottleneck from "bottleneck";
import * as cheerio from "cheerio";
import debug from "debug";
import type { Page } from "puppeteer";

import { BASE_PATH, DESCRIPTION_MAX_LENGTH } from "../lib/constants.js";
import {
	fetchPageContent,
	generateStringResponse,
	retry,
	truncateDescription,
} from "../lib/utils.js";
import type { ArticleDisplayData, ValidArticleData } from "../types/index.js";

const log = debug(`${process.env.APP_NAME}:format-articles.ts`);

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
		log(`Error enriching article ${articleData.link}: ${error}`);
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

		log(`Enriched ${enrichedArticles.length} articles successfully`);
		return enrichedArticles;
	} catch (error) {
		log(`Error in enrichArticlesData: ${error}`);
		return [];
	}
};

import { promises as fs } from "node:fs";
import path from "node:path";

export async function generateSummary(articles: ValidArticleData[]) {
	const prompt = `Analyze the following articles and create a concise, engaging summary:

	${JSON.stringify(articles, null, 2)}
	
	Your task:
	1. Generate a single paragraph summary of approximately 3 sentences - they should not use conjunctions and should be at most 500 characters.
	2. Focus on the most compelling and relevant information from the articles.
	3. Capture the overall theme or message conveyed by the collection of articles.
	4. Highlight any significant trends, innovations, or important updates in homecare.

	
	Guidelines:
	- Do not include any article titles, links, or direct references to specific articles.
	- Do not be general or vague. Focus on the most compelling and relevant information from the articles. The first sentence should not be generic.
	- Every sentence should include examples if making a general statement.
	- This is part of a weekly newsletter, so should understand the context of the articles and the week in general. It should be specific to the week's news.
	- Avoid mentioning time periods (e.g., "this month's" or "this week's").
	- DO NOT include any mention of "this week" or any other time period.
	- Do not use the term "newsletter" in your summary.
	- Write in a neutral, informative tone.
	- Aim to pique the reader's interest and encourage them to read the full articles.
	- Assume the reader has intermediate knowledge of homecare news and is familiar with the topic.

	Examples of Bad Sentences (these are all too general):

	- "Home care providers face a complex landscape of challenges and opportunities."
	- "The homecare industry faces significant challenges and opportunities.
	
	Your summary should provide a quick, informative overview that gives readers a clear sense of the valuable content available, without revealing all the details.`;

	const generatedDescription = await retry(() => generateStringResponse(prompt));

	if (!generatedDescription) {
		throw new Error("Error generating summary");
	}

	log(`Generated summary: ${generatedDescription}`);

	await fs.writeFile(
		path.join(BASE_PATH, "tests", "data", "display-article-summary.json"),
		JSON.stringify(generatedDescription),
	);

	return generatedDescription;
}

async function writeSummaryToFile() {
	const articles = await fs.readFile(
		path.join(BASE_PATH, "tests", "data", "display-article-data.json"),
		"utf8",
	);

	const summary = await generateSummary(JSON.parse(articles));

	log(`Generated summary: ${summary}`);
}
