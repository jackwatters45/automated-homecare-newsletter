import debug from "debug";

import { RECURRING_FREQUENCY } from "@/lib/constants";
import { generateJsonResponse, retry } from "@/lib/utils";
import type {
	ArticleData,
	PageToScrape,
	ValidArticleData,
	ValidArticleDataWithCount,
} from "@/types";

const log = debug(`${process.env.APP_NAME}:date-filtering.ts`);

export async function filterArticlesByPage(
	articles: ArticleData[],
	page: PageToScrape,
) {
	try {
		const filteredArticles = articles.filter(
			(article): article is ValidArticleData => {
				try {
					const weekAgo = new Date().getTime() - RECURRING_FREQUENCY;
					const isValidDate =
						!article.date || new Date(article.date).getTime() > weekAgo;

					const hasRequiredFields = !!article.link && !!article.title;

					const meetsDateRequirement =
						!page.removeIfNoDate || (!!page.removeIfNoDate && !!article.date);

					return isValidDate && hasRequiredFields && meetsDateRequirement;
				} catch (error) {
					log(`Error filtering article: ${error}`);
					return false;
				}
			},
		);

		log(
			`${page.url}: Filtered ${articles.length} articles to ${filteredArticles.length}`,
		);

		return filteredArticles;
	} catch (error) {
		log(`Error in filterPageArticles: ${error}`);
		return [];
	}
}

export async function rankAndFilterArticles(
	articles: ValidArticleData[],
	numberOfArticles = 30,
): Promise<ValidArticleDataWithCount[]> {
	try {
		const uniqueArticles = deduplicateAndCountArticles(articles);

		const aiFilteringInput = extractAIFilteringData(uniqueArticles);

		const topic = "homecare (medical)";
		const aiFilteringPrompt = `Filter, refine, and rank the following list of articles related to ${topic}:

    ${JSON.stringify(aiFilteringInput, null, 2)}

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

		const aiFilteredArticles =
			(await retry(() =>
				generateJsonResponse<ValidArticleData>(aiFilteringPrompt),
			)) ?? [];

		const rankedArticlesWithCount = mergeFilteredArticles(
			uniqueArticles,
			aiFilteredArticles,
		);

		return rankedArticlesWithCount.slice(0, numberOfArticles);
	} catch (error) {
		log(`Error in filterAllArticles: ${error}`);
		return [];
	}
}

interface ArticleDataForAIFiltering {
	title: string;
	description?: string;
}

export function extractAIFilteringData(
	articles: ValidArticleData[],
): ArticleDataForAIFiltering[] {
	try {
		return articles.map((article) => ({
			title: article.title,
			description: article.description,
		}));
	} catch (error) {
		log(`Error in getDataForAIFiltering: ${error}`);
		return [];
	}
}

export function mergeFilteredArticles(
	articleData: ValidArticleDataWithCount[],
	filteredArticles: ArticleDataForAIFiltering[],
): ValidArticleDataWithCount[] {
	try {
		const filteredTitles = new Set(filteredArticles.map((a) => a.title));
		return articleData.filter((article) => filteredTitles.has(article.title));
	} catch (error) {
		log(`Error in getOriginalArticleData: ${error}`);
		return [];
	}
}

export function deduplicateAndCountArticles(
	arr: ValidArticleData[],
	fields: (keyof ValidArticleData)[] = ["title", "link"],
): ValidArticleDataWithCount[] {
	try {
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
	} catch (error) {
		log(`Error in removeDuplicatesAndCount: ${error}`);
		return [];
	}
}
