import debug from "debug";

import { parse } from "node:url";
import { getNewsletterFrequency } from "../api/service.js";
import {
	CATEGORIES,
	MAX_ARTICLES_PER_SOURCE,
	MAX_NUMBER_OF_ARTICLES,
	MIN_NUMBER_OF_ARTICLES,
	TOPIC,
} from "../lib/constants.js";
import {
	generateJSONResponseFromModel,
	getRecurringFrequency,
	retry,
	shuffleArray,
	writeDataIfNotExists,
} from "../lib/utils.js";
import type {
	ArticleData,
	ArticleFilteringData,
	PageToScrape,
	ValidArticleData,
	ValidArticleDataWithCount,
} from "../types/index.js";

const log = debug(`${process.env.APP_NAME}:date-filtering.ts`);

export async function filterArticlesByPage(
	articles: ArticleData[],
	page: PageToScrape,
) {
	try {
		if (!articles.length) {
			throw new Error(
				"No articles found. Please check the scraping process and try again.",
			);
		}

		const frequencyWeeks = await getNewsletterFrequency();
		const frequency = getRecurringFrequency(frequencyWeeks);
		const cutoffDate = Date.now() - frequency;

		const filteredArticles = articles?.filter(
			(article): article is ArticleWithQuality => {
				try {
					const isValidDate =
						!article.date || new Date(article.date).getTime() > cutoffDate;

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
			`${page.url}: Filtered ${articles.length} articles to ${filteredArticles.length} using non-AI filtering`,
		);

		return filteredArticles;
	} catch (error) {
		log(`Error in filterPageArticles: ${page.url} ${error}`);
		return [];
	}
}

export async function filterArticles(
	articles: ArticleFilteringData[],
): Promise<ArticleFilteringData[]> {
	try {
		const aiFilteringPrompt = `Filter the following list of articles related to ${TOPIC}:

		${JSON.stringify(articles, null, 2)}

		Filtering criteria:
		1. Relevance: Ensure articles are directly related to ${TOPIC} news. Remove any articles that are not specifically about homecare or home health.
		2. Recency: Keep articles published within the last week. If two articles cover the same event, keep only the most recent one.
		3. Credibility: Retain articles from reputable healthcare news sources and industry publications.
		4. Exclusions: 
			- Remove articles about DME (Durable Medical Equipment) or Hospice care unless they have a direct and significant impact on homecare or home health.
			- Exclude non-news content such as opinions, editorials, briefs, or promotional material. The articles need to be newsworthy and provide substantial information about homecare or home health. They should not be generic or unrelated to homecare or home health. An example of a non-news article would be "Home Care briefs for Tuesday, July 9"
			- Remove duplicate or similar articles.

		Additional Instructions:
		- Analyze the article titles and descriptions to ensure they provide substantial, newsworthy information about homecare or home health.
		- Pay attention to keywords in the titles and descriptions that indicate relevance to homecare and home health industry trends, regulations, or significant events.

		Output Instructions:
		- Return the filtered list as a JSON array in the exact format of the original list.
		- If all articles are irrelevant, return an empty array.
		- Ensure the output strictly adheres to the original JSON structure.

		Example of expected output format:
		[
			{
				"title": "Example Title",
				"link": "https://example.com",
				"date": "2023-07-01T12:00:00Z",
				"description": "Example description",
				"url": "https://example.com"
			},
			// ... more articles
		]`;

		const filteredArticles =
			(await retry(() => generateJSONResponseFromModel(aiFilteringPrompt))) ?? [];

		await writeDataIfNotExists("filtered-article-data.json", filteredArticles);

		return filteredArticles;
	} catch (error) {
		log(`Error in filterAllArticles: ${error}`);
		return [];
	}
}

export async function rankArticles(
	filteredArticles: ArticleFilteringData[],
	maxNumberOfArticles = MAX_NUMBER_OF_ARTICLES,
	minNumberOfArticles = MIN_NUMBER_OF_ARTICLES,
): Promise<ArticleFilteringData[]> {
	const aiRankingPrompt = `Rank the following list of filtered articles related to ${TOPIC}:
	
		${JSON.stringify(filteredArticles, null, 2)}
		
		Ranking criteria:
		1. Impact: Prioritize articles that discuss significant industry changes, policy updates, or innovations in homecare and home health.
		2. Diversity of Content: Ensure a mix of articles covering different aspects of homecare and home health (e.g., technology, policy, patient care, business developments).
		3. Category Balance: Aim for an even distribution across these categories: ${CATEGORIES.join(", ")}. Each category should have approximately ${Math.floor(maxNumberOfArticles / CATEGORIES.length)} articles.
		4. Source Variety: Use a diverse range of sources. Limit articles from any single source to a maximum of 3.
		5. Relevance: Prioritize articles that are directly related to ${TOPIC}.
		
		Additional Instructions:
		- Consider the potential impact of the news on homecare providers, patients, or the industry as a whole when ranking articles.
		- Ensure a balance between national and local news, favoring stories with broader impact.
		- No single category should have more than ${Math.ceil(maxNumberOfArticles / CATEGORIES.length) + 1} articles.
		
		Output Instructions:
		- Return the ranked list as a JSON array in the exact format of the input list.
		- Include the top ${maxNumberOfArticles} most relevant articles in the output.
		- Return a maximum of ${maxNumberOfArticles} articles and minimum of ${minNumberOfArticles} articles.
		- If fewer than ${maxNumberOfArticles} articles are in the input, return all of them in ranked order.
		- Ensure the output strictly adheres to the original JSON structure.
		- Sort the articles by impact and diversity of content where the most impactful articles are at the top.
		
		Example of expected output format:
		[
			{
				"title": "Example Title",
				"link": "https://example.com",
				"date": "2023-07-01T12:00:00Z",
				"description": "Example description",
				"url": "https://example.com"
			},
			// ... more articles
		]`;

	const rankedArticles =
		(await retry(() => generateJSONResponseFromModel(aiRankingPrompt))) ?? [];

	return rankedArticles;
}

// TODO: source + distribution
export async function filterAndRankArticles(
	articles: ValidArticleData[],
	targetArticleCount = MAX_NUMBER_OF_ARTICLES,
	initialMaxArticlesPerSource = MAX_ARTICLES_PER_SOURCE,
): Promise<ValidArticleDataWithCount[]> {
	try {
		const uniqueArticles = deduplicateAndCountArticles(articles);

		const shuffledArticles = shuffleArray(uniqueArticles);

		const aiFilteringInput = extractArticleFilteringData(shuffledArticles);

		const filteredArticles = await filterArticles(aiFilteringInput);
		const rankedArticles = await rankArticles(
			filteredArticles,
			targetArticleCount,
		);

		const rankedArticlesWithCount = mergeFilteredArticles(
			shuffledArticles,
			rankedArticles,
		);

		const filteredAndRankedArticles = rankedArticlesWithCount.slice(
			0,
			targetArticleCount,
		);

		await writeDataIfNotExists(
			"filtered-ranked-article-data.json",
			filteredAndRankedArticles,
		);

		log("filtered articles generated", filteredAndRankedArticles.length);

		if (filteredAndRankedArticles.length < MIN_NUMBER_OF_ARTICLES) {
			log("Not enough articles after filtering and ranking");
			throw new Error("Not enough articles after filtering and ranking");
		}

		return filteredAndRankedArticles;
	} catch (error) {
		throw new Error("Error in filterAndRankArticles");
	}
}

function groupArticlesBySource(
	articles: ValidArticleDataWithCount[],
): Map<string, ValidArticleDataWithCount[]> {
	const groupedArticles = new Map<string, ValidArticleDataWithCount[]>();

	for (const article of articles) {
		const source = getSourceFromUrl(article.link);

		const groupedArticlesForSource = groupedArticles.get(source);

		if (!groupedArticlesForSource) {
			groupedArticles.set(source, []);
		} else {
			groupedArticlesForSource.push(article);
		}
	}

	return groupedArticles;
}

function getSourceFromUrl(url: string): string {
	const parsedUrl = new URL(url);
	return parsedUrl.hostname || url;
}

function extractArticleFilteringData(
	articles: ValidArticleData[],
): ArticleFilteringData[] {
	try {
		return articles.map((article) => ({
			title: article.title,
			description: article.description ?? article.snippet,
		}));
	} catch (error) {
		log(`Error in getDataForAIFiltering: ${error}`);
		return [];
	}
}

export function mergeFilteredArticles(
	articleData: ValidArticleDataWithCount[],
	filteredArticles: ArticleFilteringData[],
): ValidArticleDataWithCount[] {
	try {
		return filteredArticles.reduce<ValidArticleDataWithCount[]>(
			(acc, { title }) => {
				const article = articleData.find((a) => a.title === title);
				if (article) {
					const { snippet: _, ...rest } = article;
					acc.push(rest);
				}
				return acc;
			},
			[],
		);
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

			if (!uniqueMap.has(key)) {
				uniqueMap.set(key, { ...item, count: 1 });
			}
		}

		return Array.from(uniqueMap.values());
	} catch (error) {
		log(`Error in removeDuplicatesAndCount: ${error}`);
		return [];
	}
}
