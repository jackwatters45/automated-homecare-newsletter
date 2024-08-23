import { promises as fs } from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import debug from "debug";

import {
	BASE_PATH,
	CATEGORIES,
	DESCRIPTION_MAX_LENGTH,
} from "../lib/constants.js";
import logger from "../lib/logger.js";
import { rateLimiter } from "../lib/rate-limit.js";
import {
	fetchPageContent,
	generateJSONResponseFromModel,
	retry,
	sortCategoriesByName,
	truncateDescription,
	writeDataIfNotExists,
} from "../lib/utils.js";
import type {
	ArticleInput,
	ArticleInputWithCategory,
	CategoryInput,
	ValidArticleData,
} from "../types/index.js";

const log = debug(`${process.env.APP_NAME}:format-articles.ts`);

export const enrichArticleData = async (
	articleData: ValidArticleData,
): Promise<ArticleInput> => {
	let pageContent: string | undefined;

	try {
		if (articleData.description && articleData.description.length > 120) {
			return {
				title: articleData.title,
				link: articleData.link,
				description: truncateDescription(articleData.description),
			};
		}

		pageContent = await retry(() => fetchPageContent(articleData.link));

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

		const generatedDescription = await rateLimiter.schedule(() =>
			retry<string>(() => generateJSONResponseFromModel(descriptionPrompt)),
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
		log(`Error enriching article ${articleData.link}: ${error} ${pageContent}`);
		return {
			title: articleData.title,
			link: articleData.link,
			description: "Unable to generate description due to an error.",
		};
	}
};

export function createDescriptionPrompt(articleText: string): string {
	return `
	Generate a subtitle description for the following article:

    ${articleText}
    
    Requirements:
    - The subtitle should be a single sentence of no more than ${DESCRIPTION_MAX_LENGTH} words
    - Capture the essence of the article without repeating the title
    - Highlight a key insight, finding, or angle of the article
    - Use engaging language that complements the title
    - Assume the reader has basic familiarity with the topic
    - Do not use colons or semicolons
		- If you cannot generate a description, return an empty string.
		- If the article is not relevant to the newsletter, return an empty string.

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
): Promise<ArticleInput[]> => {
	try {
		const enrichedArticles = await Promise.all(
			prioritizedArticles.map((article) =>
				rateLimiter.schedule(() => enrichArticleData(article)),
			),
		);

		log(`Enriched ${enrichedArticles.length} articles successfully`);
		await writeDataIfNotExists("display-article-data.json", enrichedArticles);

		return enrichedArticles;
	} catch (error) {
		log(`Error in enrichArticlesData: ${error}`);
		return [];
	}
};

export async function generateSummary(
	articles: ValidArticleData[],
): Promise<string> {
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

	const generatedDescription = await rateLimiter.schedule(() =>
		retry<string>(() => generateJSONResponseFromModel(prompt)),
	);

	const formattedDescription = generatedDescription?.trim();

	if (!formattedDescription) {
		logger.error("Error generating summary", { articles });
		throw new Error("Error generating summary");
	}

	log(`Generated summary: ${formattedDescription}`);
	await writeDataIfNotExists("summary.json", formattedDescription);

	return formattedDescription;
}

async function writeSummaryToFile() {
	const articles = await fs.readFile(
		path.join(BASE_PATH, "tests", "data", "display-article-data.json"),
		"utf8",
	);

	await generateSummary(JSON.parse(articles));
}

export async function generateCategories(
	articles: ValidArticleData[],
): Promise<ArticleInputWithCategory[]> {
	const prompt = `Analyze the following articles and categorize them according to the predefined categories:

  ${JSON.stringify(articles, null, 2)}
  
  CATEGORIES (maintain the order):
  ${CATEGORIES.join("\n")}
  
  Please follow these guidelines:
  1. Assign each article to one of the predefined categories.	
  2. If an article doesn't fit well into any category, assign it to "Other". Try to avoid using "Other" unless there is a great article that doesn't fit into any category.
	3. Try to evenly distribute the articles across the categories. Ideally, each category (except other) should have an even number of articles.  
  
  Format your response as a JSON array with the following structure:
  [
    {
      "title": "Article Title",
      "link": "Article Link",
      "description": "Article Description",
      "category": "Category Name"
    },
    ...
  ]

  Ensure your response is valid JSON that can be parsed programmatically.`;

	const generatedArticles = await retry<ArticleInputWithCategory[]>(() =>
		generateJSONResponseFromModel(prompt),
	);

	if (!generatedArticles || generatedArticles.length === 0) {
		throw new Error("Error generating categorized articles");
	}

	return generatedArticles;
}

function deduplicateArticles(articles: ArticleInput[]): ArticleInput[] {
	const articleMap = new Map<string, ArticleInput>();

	for (const article of articles) {
		if (articleMap.has(article.title)) {
			// biome-ignore lint/style/noNonNullAssertion: <>
			const existingArticle = articleMap.get(article.title)!;
			existingArticle.description += `\n\n${article.description}`;
		} else {
			articleMap.set(article.title, { ...article });
		}
	}

	return Array.from(articleMap.values());
}

function processCategories(
	generatedCategories: CategoryInput[],
): CategoryInput[] {
	log("generated categories", generatedCategories);

	return generatedCategories
		.map((category) => ({
			...category,
			articles: deduplicateArticles(category.articles),
		}))
		.filter((category) => category.articles.length > 0);
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

	await writeDataIfNotExists("display-data-full.json", categories);
}
