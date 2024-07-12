import { promises as fs } from "node:fs";
import path from "node:path";
import Bottleneck from "bottleneck";
import * as cheerio from "cheerio";
import debug from "debug";
import type { Page } from "puppeteer";

import {
	BASE_PATH,
	CATEGORIES,
	DESCRIPTION_MAX_LENGTH,
} from "../lib/constants.js";
import {
	fetchPageContent,
	generateJSONResponseFromModel,
	retry,
	truncateDescription,
	writeTestData,
} from "../lib/utils.js";
import type {
	ArticleDisplayData,
	Category,
	ValidArticleData,
} from "../types/index.js";

const log = debug(`${process.env.APP_NAME}:format-articles.ts`);

const rateLimiter = new Bottleneck({
	maxConcurrent: 10,
	minTime: 2500,
});

export const enrichArticleData = async (
	articleData: ValidArticleData,
	browserInstance: Page,
): Promise<ArticleDisplayData> => {
	try {
		if (articleData.description && articleData.description.length > 120) {
			return {
				title: articleData.title,
				link: articleData.link,
				description: truncateDescription(articleData.description),
			};
		}

		const pageContent = await retry(() =>
			fetchPageContent(articleData.link, browserInstance),
		);

		if (!pageContent) {
			log("Page content is empty");
			return { title: articleData.title, link: articleData.link, description: "" };
		}

		const $ = cheerio.load(pageContent);
		const fullArticleText =
			$("body").text() ?? pageContent ?? articleData.description;

		if (!fullArticleText) {
			log("Full article text is empty");
			return { title: articleData.title, link: articleData.link, description: "" };
		}

		const descriptionPrompt = createDescriptionPrompt(fullArticleText);

		const generatedDescription = await retry(() =>
			generateJSONResponseFromModel(descriptionPrompt),
		);

		const description = generatedDescription?.trim();
		if (!description) {
			log("Generated description is empty");
			return { title: articleData.title, link: articleData.link, description: "" };
		}

		return {
			title: articleData.title,
			link: articleData.link,
			description: truncateDescription(description),
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

export function createDescriptionPrompt(articleText: string): string {
	return `Generate a subtitle description for the following article:

    ${articleText}
    
    Requirements:
    - The subtitle should be a single sentence of no more than ${DESCRIPTION_MAX_LENGTH} words
    - Capture the essence of the article without repeating the title
    - Highlight a key insight, finding, or angle of the article
    - Use engaging language that complements the title
    - Assume the reader has basic familiarity with the topic
    - Do not use colons or semicolons
		- If you cannot generate a description, return an empty string.

		Content Guidelines:
		- Do not include any article titles, links, or direct references to specific articles.
		- Do not be general or vague. Focus on the most compelling and relevant information from the articles.
		- Assume the reader has basic familiarity with the topic.
		- Do not use the term "newsletter" in your summary.
		- Write in a neutral, informative tone.
		- Aim to pique the reader's interest and encourage them to read the full articles.
		`;
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

export async function generateSummary(articles: ValidArticleData[]) {
	const prompt = `Analyze the following articles and create a concise, engaging summary:

	${JSON.stringify(articles, null, 2)}
	
	Your task:
	1. Generate a single paragraph summary of approximately 3 sentences - they should not use conjunctions and should be at most 450 characters.
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

	const generatedDescription = await retry(() =>
		generateJSONResponseFromModel(prompt),
	);

	const formattedDescription = generatedDescription?.trim();

	if (!formattedDescription) {
		throw new Error("Error generating summary");
	}

	log(`Generated summary: ${formattedDescription}`);
	await writeTestData("summary.json", formattedDescription);

	return formattedDescription;
}

async function writeSummaryToFile() {
	const articles = await fs.readFile(
		path.join(BASE_PATH, "tests", "data", "display-article-data.json"),
		"utf8",
	);

	await generateSummary(JSON.parse(articles));
}

export async function generateCategories(articles: ValidArticleData[]) {
	const prompt = `Analyze the following articles and categorize them according to the predefined categories:

	${JSON.stringify(articles, null, 2)}
	
	CATEGORIES:
	${CATEGORIES.join("\n")}
	
	Please follow these guidelines:
	1. Assign each article to at least one of the predefined categories. An article can belong to multiple categories if appropriate.
	2. If any articles don't fit well into the main categories, create a "Miscellaneous" category for them.
	
	Format your response as a JSON object with the following structure:
	[
			{
				"name": "Category Name",
				"articles": [
					{
						"title": "Article Title",
						"link": "Article Link",
						"description": "Article Description"
					},
					...
				]
			},
			{
				"name": "Category Name 2",
				"articles": [
					{
						"title": "Article Title",
						"link": "Article Link",
						"description": "Article Description"
					},
					...
				]
			},
			...
		]

	
	Ensure your response is valid JSON that can be parsed programmatically.`;

	const generatedCategories = await retry<Category[]>(() =>
		generateJSONResponseFromModel(prompt),
	);

	if (!generatedCategories) {
		log("Error generating summary");
	}

	return generatedCategories?.filter((category) => category.articles.length > 0);
}

async function writeCategoriesToFile() {
	const articleData = JSON.parse(
		await fs.readFile(
			path.join(BASE_PATH, "tests", "data", "display-article-data.json"),
			"utf8",
		),
	);

	const categories = await generateCategories(articleData);

	log(categories);

	await writeTestData("display-data-full.json", categories);
}
