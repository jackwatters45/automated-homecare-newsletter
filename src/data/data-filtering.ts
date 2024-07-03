import debug from "debug";

import type {
	ArticleData,
	PageToScrape,
	ValidArticleData,
	ValidArticleDataWithCount,
} from "../../types";
import { RECURRING_FREQUENCY } from "../lib/constants";
import { generateJsonResponse } from "../lib/utils";

const log = debug(`${process.env.APP_NAME}:date-filtering.ts`);

export async function filterPageArticles(
	articles: ArticleData[],
	page: PageToScrape,
) {
	const filteredArticles = articles.filter(
		(article): article is ValidArticleData => {
			const weekAgo = new Date().getTime() - RECURRING_FREQUENCY;
			const isValidDate =
				!article.date || new Date(article.date).getTime() > weekAgo;

			const hasRequiredFields = !!article.link && !!article.title;

			const meetsDateRequirement =
				!page.removeIfNoDate || (!!page.removeIfNoDate && !!article.date);

			return isValidDate && hasRequiredFields && meetsDateRequirement;
		},
	);

	return filteredArticles;
}

export async function filterAllArticles(
	articles: ValidArticleData[],
	numberOfArticles = 30,
): Promise<ValidArticleDataWithCount[]> {
	const articlesNoDuplicates = removeDuplicatesAndCount(articles);

	const aiFilteringData = getDataForAIFiltering(articlesNoDuplicates);

	const topic = "homecare (medical)";
	const filterAndRankPrompt = `Filter, refine, and rank the following list of articles related to ${topic}:

	${JSON.stringify(aiFilteringData, null, 2)}

	Filtering and ranking criteria:
	1. Remove articles irrelevant to ${topic} news
	2. Exclude non-news content (e.g., opinions, editorials)
	3. If two articles are very similar or cover the same event, keep only the most recent one
	4. Rank the articles by relevance and importance to the topic

	Instructions:
	- Return the filtered and ranked list as a JSON array in the exact format of the original list
	- If all articles are irrelevant, return an empty array
	- If all articles are relevant and unique, return the original list
	- Ensure the output strictly adheres to the original JSON structure
	- Limit the list to the top ${numberOfArticles} articles

		Example of expected output format:
		[
			{
				"title": "Example Title",
				"link": "https://example.com",
				"date": "2023-07-01T12:00:00Z",
				"description": "Example description"
			},
			// ... more articles
		]
		`;

	const relevantArticles =
		await generateJsonResponse<ValidArticleData>(filterAndRankPrompt);

	const relevantArticlesWithCount = getOriginalArticleData(
		articlesNoDuplicates,
		relevantArticles,
	);

	return relevantArticlesWithCount.slice(0, numberOfArticles);
}

interface ArticleDataForAIFiltering {
	title: string;
	description?: string;
}

export function getDataForAIFiltering(
	articles: ValidArticleData[],
): ArticleDataForAIFiltering[] {
	return articles.map((article) => ({
		title: article.title,
		description: article.description,
	}));
}

export function getOriginalArticleData(
	articleData: ValidArticleDataWithCount[],
	filteredArticles: ArticleDataForAIFiltering[],
): ValidArticleDataWithCount[] {
	const filteredTitles = new Set(filteredArticles.map((a) => a.title));
	return articleData.filter((article) => filteredTitles.has(article.title));
}

export function removeDuplicatesAndCount(
	arr: ValidArticleData[],
	fields: (keyof ValidArticleData)[] = ["title", "link"],
): ValidArticleDataWithCount[] {
	const uniqueMap = new Map<string, ValidArticleDataWithCount>();

	for (const item of arr) {
		const key = fields.map((field) => `${field}:${item[field]}`).join("|");

		if (uniqueMap.has(key)) {
			const existingItem = uniqueMap.get(key) as ValidArticleDataWithCount;
			existingItem.count++;
		} else {
			uniqueMap.set(key, { ...item, count: 1 });
		}
	}

	return Array.from(uniqueMap.values()).sort((a, b) => b.count - a.count);
}
