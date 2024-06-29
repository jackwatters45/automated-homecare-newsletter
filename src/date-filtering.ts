import debug from "debug";

import type {
	ArticleData,
	PageToScrape,
	ValidArticleData,
	ValidArticleDataWithCount,
} from "../types";
import { APP_NAME, RECURRING_FREQUENCY } from "./constants";
import { generateJsonResponse } from "./utils";

const log = debug(`${APP_NAME}:date-filtering.ts`);

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

export async function filterAllArticles(articles: ValidArticleData[]) {
	const articlesNoDuplicates = removeDuplicatesAndCount(articles);

	const aiFilteringData = getDataForAIFiltering(articlesNoDuplicates);

	// TODO improve prompt
	const topic = "homecare (medical)";
	const prompt = `remove any articles that are irrelevant to the topic of ${topic}:\n\n${JSON.stringify(aiFilteringData, null, 2)}.\n\n return the remaining articles as a JSON array in the same format as the original list. If they are all irrelevant, return an empty array. If they are all relevant, return the original list. Under no circumstances should you return something that is not in the same format as the original list.`;

	const relevantArticles = await generateJsonResponse<ValidArticleData>(prompt);

	return getOriginalArticleData(articlesNoDuplicates, relevantArticles);
}

interface ArticleDataForAIFiltering {
	title: string;
	description?: string;
}

function getDataForAIFiltering(
	articles: ValidArticleData[],
): ArticleDataForAIFiltering[] {
	return articles.map((article) => ({
		title: article.title,
		description: article.description,
	}));
}

function getOriginalArticleData(
	articleData: ValidArticleDataWithCount[],
	filteredArticles: ArticleDataForAIFiltering[],
): ValidArticleData[] {
	const filteredTitles = new Set(filteredArticles.map((a) => a.title));
	return articleData.filter((article) => filteredTitles.has(article.title));
}

function removeDuplicatesAndCount(
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
