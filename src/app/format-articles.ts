import debug from "debug";

import { google } from "@ai-sdk/google";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import {
	CATEGORIES,
	DESCRIPTION_MAX_LENGTH,
	MAX_TOKENS,
	MIN_NUMBER_OF_ARTICLES,
	SYSTEM_INSTRUCTION,
} from "../lib/constants.js";
import logger from "../lib/logger.js";
import { logAiCall, shuffleArray, writeDataIfNotExists } from "../lib/utils.js";
import type {
	ArticleForCategorization,
	ArticleWithCategories,
	ArticleWithQuality,
	CategorizedArticle,
	Category,
} from "../types/index.js";

const log = debug(`${process.env.APP_NAME}:format-articles.ts`);

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

export async function generateSummary(
	articles: ArticleWithQuality[],
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

	const { text: generatedDescription } = await generateText({
		model: google("gemini-1.5-flash-latest"),
		system: SYSTEM_INSTRUCTION,
		prompt: prompt,
	});

	logAiCall();

	const formattedDescription = generatedDescription?.trim();

	if (!formattedDescription) {
		logger.error("Error generating summary", { articles });
		throw new Error("Error generating summary");
	}

	log(`Generated summary: ${formattedDescription}`);
	await writeDataIfNotExists("summary.json", formattedDescription);

	return formattedDescription;
}

export async function generateCategories(
	articles: ArticleForCategorization[],
): Promise<CategorizedArticle[]> {
	// Step 1: Use AI to assign up to 3 ranked categories to each article
	const articlesWithRankedCategories = await assignRankedCategories(articles);

	// Step 2: Distribute articles across categories, assigning a single category to each
	const distributedArticles = distributeArticles(articlesWithRankedCategories);

	await writeDataIfNotExists(
		"articles-with-categories.json",
		distributedArticles,
	);

	log("articlesWithCategories", distributedArticles.length);

	return distributedArticles;
}

async function assignRankedCategories(
	articles: ArticleForCategorization[],
): Promise<ArticleWithCategories[]> {
	const prompt = `
    Categorize the following articles into these categories:
    ${CATEGORIES.join(", ")}

    For each article, assign up to 3 most relevant categories, ranked by relevance. 
    If no category fits, use "Other" as the only category.
    
    Articles:
    ${JSON.stringify(articles, null, 2)}

    Respond with an array where each item has the original article data plus a 'categories' array.
    The 'categories' array should contain up to 3 categories, ordered from most to least relevant.
  `;

	const { object } = await generateObject({
		model: google("gemini-1.5-flash-latest"),
		system: SYSTEM_INSTRUCTION,
		output: "array",
		schema: z.object({
			title: z.string(),
			description: z.string(),
			link: z.string(),
			quality: z.number(),
			categories: z.array(z.enum(CATEGORIES)),
		}),
		prompt: prompt,
		maxTokens: MAX_TOKENS,
	});

	logAiCall();

	return object;
}

function distributeArticles(
	articles: ArticleWithCategories[],
): CategorizedArticle[] {
	const categoryCount: Record<Category, number> = {} as Record<Category, number>;
	for (let i = 0; i < CATEGORIES.length; i++) {
		categoryCount[CATEGORIES[i]] = 0;
	}

	const distributedArticles: CategorizedArticle[] = [];

	for (let i = 0; i < articles.length; i++) {
		const article = articles[i];
		let assignedCategory: Category = "Other";

		// Try to assign to one of the article's ranked categories
		for (let j = 0; j < article.categories.length; j++) {
			const category = article.categories[j];
			if (category !== "Other") {
				// Check if the category is not overly represented
				if (
					categoryCount[category] < Math.ceil(articles.length / CATEGORIES.length)
				) {
					assignedCategory = category;
					break;
				}
			}
		}

		distributedArticles.push({
			title: article.title,
			description: article.description,
			quality: article.quality,
			category: assignedCategory,
		});
		categoryCount[assignedCategory]++;
	}

	// Log category distribution
	log("Category distribution:", categoryCount);

	if (distributedArticles.length < MIN_NUMBER_OF_ARTICLES) {
		log("Not enough articlesWithCategories on this attempt");
		throw new Error("Not enough articlesWithCategories on this attempt");
	}

	// Shuffle to ensure a good mix of articles within each category
	return shuffleArray(distributedArticles);
}
