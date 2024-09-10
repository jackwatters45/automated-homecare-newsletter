import debug from "debug";

import { int } from "drizzle-orm/mysql-core";
import { z } from "zod";
import { getNewsletterFrequency } from "../api/service.js";
import { generateAIJsonResponse } from "../lib/ai.js";
import {
	CATEGORIES,
	MAX_ARTICLES_PER_SOURCE,
	MIN_NUMBER_OF_ARTICLES,
	TARGET_NUMBER_OF_ARTICLES,
	TOPIC,
} from "../lib/constants.js";
import { AppError, NotFoundError } from "../lib/errors.js";
import {
	getDescription,
	getRecurringFrequency,
	getSourceFromUrl,
	logAiCall,
	retry,
	shuffleArray,
	writeDataIfNotExists,
	writeTestData,
} from "../lib/utils.js";
import type {
	ArticleData,
	ArticleFilteringData,
	ArticleForCategorization,
	ArticleWithOptionalSource,
	ArticleWithOptionalSourceAndCount,
	ArticleWithQuality,
	ArticleWithQualityAndCategory,
	ArticleWithSourceAndCount,
	CategorizedArticle,
	PageToScrape,
	RankedArticle,
} from "../types/index.js";
import { generateCategories } from "./format-articles.js";

const log = debug(`${process.env.APP_NAME}:date-filtering.ts`);

export async function filterAndRankArticles(
	rawArticles: ArticleWithOptionalSource[],
	targetArticleCount = TARGET_NUMBER_OF_ARTICLES * 2,
	maxArticlesPerSource = MAX_ARTICLES_PER_SOURCE,
) {
	log("filtering and ranking articles");
	try {
		const uniqueArticles = deduplicateAndCountArticles(rawArticles);

		const shuffledArticles = shuffleArray(uniqueArticles);
		const aiFilteringInput = extractArticleFilteringData(shuffledArticles);

		// First round of filtering: Filter based on title and description/snippet
		const firstFilteredArticles = await retry(
			async () => await filterArticles(aiFilteringInput),
			5,
		);

		// Generate descriptions for articles without them
		const articlesWithDescriptions = await retry(async () => {
			const articlesWithDescriptions = await Promise.all(
				firstFilteredArticles.map(async (article) => {
					if (!article.description) {
						article.description = (await getDescription(article)) ?? "";
					}
					return article;
				}),
			);

			log("Added descriptions to articles");

			return articlesWithDescriptions;
		});

		log("articlesWithDescriptions", articlesWithDescriptions.length);

		// Second round of filtering with updated descriptions
		const secondFilteredArticles = await retry(
			async () =>
				await filterArticles(articlesWithDescriptions, targetArticleCount, false),
			5,
		);

		const rankedArticles = await retry(
			async () => await rankArticles(secondFilteredArticles, targetArticleCount),
			5,
		);

		const articlesWithLimitedSources = await retry(
			async () =>
				await limitArticlesPerSource(rankedArticles, maxArticlesPerSource),
			5,
		);

		const articlesWithCategories = await retry(
			async () => await generateCategories(articlesWithLimitedSources),
		);

		const mergedRankedArticles = await mergeFilteredArticles(
			shuffledArticles,
			articlesWithCategories,
		);

		const articles = deduplicateArticles(mergedRankedArticles);

		log("final (deduplicated) article count", articles.length);

		return articles;
	} catch (error) {
		if (error instanceof AppError) throw error;
		throw new AppError("Error in filterAndRankArticles", { cause: error });
	}
}

export async function filterArticlesByPage(
	articles: ArticleData[],
	page: PageToScrape,
) {
	try {
		if (!articles.length) {
			throw new NotFoundError(
				"No articles found. Please check the scraping process and try again.",
				{
					page,
				},
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
	articles: ArticleWithSourceAndCount[],
	targetArticleCount = TARGET_NUMBER_OF_ARTICLES * 2,
	isFirstAttempt = true,
) {
	const aiFilteringPrompt = `Evaluate and prioritize the following list of articles related to ${TOPIC}. Your goal is to filter out non-relevant articles, aiming for approximately ${targetArticleCount} high-quality, relevant articles.

		${JSON.stringify(articles, null, 2)}
		
		Evaluation criteria (in order of importance):
		1. Relevance: Include articles related to ${TOPIC} news. Articles should focus on homecare or home health, but can include closely related topics.
		2. Specificity: Prefer articles with specific, informative titles and content about homecare or home health. Less specific articles may be included if highly relevant.
		3. Recency: Prioritize articles covering recent developments or ongoing trends in the field.
		4. Credibility: Prefer articles from reputable sources and with substantive content.
		5. Diversity: Aim for a mix of subtopics within homecare and home health.
		
		Content guidelines:
		- Exclude articles primarily about DME (Durable Medical Equipment) or Hospice care, unless they have significant relevance to homecare or home health.
		- Prioritize articles specifically about homecare or home health, but consider including closely related topics if they have strong implications for the industry.
		- Prioritize news content. Include high-quality opinion pieces or editorials if they offer valuable insights related to homecare or home health.
		- If there are very similar articles, select the most comprehensive or recent one.
		
		Additional Instructions:
		- Evaluate based on both titles and descriptions/snippets. If either suggests relevance to homecare or home health, consider including the article.
		- If an article lacks a description, evaluate based on the title alone. Do not create or infer a description.
		- Look for keywords related to homecare and home health, but allow for some flexibility in terminology.
		- If unsure about an article's relevance, lean towards inclusion if it might offer valuable insights to the industry.
		- Ignore the source when evaluating the relevance of an article. Only consider the title and description.
		
	
Output Instructions:
- Return the strictly filtered list as a JSON array of objects.
- Each object in the array should have the following structure:
  {
    "title": "Article Title",
    "description": "Article Description",
    "count": 1,
    "source": "www.example.com",
    "link": "https://www.example.com/article"
  }
- Ensure the output is a valid JSON array, not an object.
- Do not include any explanatory text outside of the JSON array.

Example of expected output format:
[
  {
    "title": "Example Highly Relevant Title",
    "description": "Example description clearly about homecare",
    "count": 2,
    "source": "www.homecareexample.com",
    "link": "https://www.homecareexample.com/article1"
  },
  // ... more strictly relevant articles
]`;

	try {
		const { content: filteredArticles } = await generateAIJsonResponse({
			schema: z.array(
				z.object({
					title: z.string(),
					description: z.string(),
					count: z.number(),
					source: z.string(),
					link: z.string(),
				}),
			),
			prompt: aiFilteringPrompt,
		});

		logAiCall();

		await writeDataIfNotExists("filtered-article-data.json", filteredArticles);

		const attempt = isFirstAttempt ? 1 : 2;
		log(
			`articles after strict filter ${attempt}: ${filteredArticles.length} articles`,
		);

		if (filteredArticles.length < TARGET_NUMBER_OF_ARTICLES) {
			log(`Not enough strictly relevant articles after filter ${attempt}.`);
			throw new AppError(
				`Not enough strictly relevant articles after filter ${attempt}.`,
			);
		}

		return filteredArticles;
	} catch (error) {
		if (error instanceof AppError) throw error;
		throw new AppError("Error in filterArticles", { cause: error });
	}
}

export async function rankArticles(
	filteredArticles: ArticleFilteringData[],
	targetArticleCount = TARGET_NUMBER_OF_ARTICLES,
): Promise<RankedArticle[]> {
	const aiRankingPrompt = `Rank the following list of filtered articles related to ${TOPIC}:
	
		${JSON.stringify(filteredArticles, null, 2)}
		
		Ranking criteria:
		1. Impact: Prioritize articles that discuss significant industry changes, policy updates, or innovations in homecare and home health.
		2. Diversity of Content: Ensure a mix of articles covering different aspects of homecare and home health (e.g., technology, policy, patient care, business developments).
		3. Category Balance: Aim for an even distribution across these categories: ${CATEGORIES.join(", ")}. Each category should have approximately ${Math.ceil(targetArticleCount / CATEGORIES.length)} articles.
		4. Source Variety: Use a diverse range of sources. 
		5. Relevance: Prioritize articles that are directly related to ${TOPIC}.
		6. Quantity: Prioritize articles with a higher quantity (count).
		
		Additional Instructions:
		- Consider the potential impact of the news on homecare providers, patients, or the industry as a whole when ranking articles.
		- Ensure a balance between national and local news, favoring stories with broader impact.

		Output Instructions:
		- Return the ranked list as a JSON array in the exact format of the input list.
		- Include the top ${targetArticleCount} most relevant articles in the output.
		- Return a maximum of ${targetArticleCount} articles and minimum of ${targetArticleCount} articles.
		- If fewer than ${targetArticleCount} articles are in the input, return all of them in ranked order.
		- Ensure the output strictly adheres to the original JSON structure.
		- Sort the articles by impact and diversity of content where the most impactful articles are at the top.
		- The quality of the article is a number between 0 and 1, where 0 is the least quality and 1 is the highest quality.
		
		Example of expected output format:
		[
			{
				"title": "Example Title",
				"description": "Example description",
				"source": "www.mcknightshomecare.com",
				"count": 1,
				"quality": 0.5
			},
			// ... more articles
		]`;

	try {
		const { content: rankedArticles } = await generateAIJsonResponse({
			schema: z.array(
				z.object({
					title: z.string(),
					description: z.string(),
					source: z.string(),
					count: z.number(),
					quality: z.number(),
				}),
			),
			prompt: aiRankingPrompt,
		});

		logAiCall();

		await writeTestData(["ranked-article-data.json"], rankedArticles);

		log("ranked articles", rankedArticles?.length);

		if (rankedArticles.length < MIN_NUMBER_OF_ARTICLES) {
			log("Not enough ranked articles on this attempt");
			throw new AppError("Not enough ranked articles on this attempt");
		}

		return rankedArticles;
	} catch (error) {
		if (error instanceof AppError) throw error;
		throw new AppError("Error in rankArticles", { cause: error });
	}
}

async function limitArticlesPerSource(
	articles: RankedArticle[],
	maxArticlesPerSource = MAX_ARTICLES_PER_SOURCE,
): Promise<ArticleForCategorization[]> {
	try {
		// Group articles by source
		const groupedArticles = articles.reduce<
			Record<string, ArticleForCategorization[]>
		>((acc, article) => {
			if (!acc[article.source]) {
				acc[article.source] = [
					{
						title: article.title,
						description: article.description,
						quality: article.quality,
					},
				];
			}
			acc[article.source].push({
				title: article.title,
				description: article.description,
				quality: article.quality,
			});
			return acc;
		}, {});

		// Sort articles within each source by quality (descending) and limit the number
		const limitedArticles = Object.values(groupedArticles).flatMap(
			(sourceArticles) =>
				sourceArticles
					.sort((a, b) => b.quality - a.quality) // Sort by quality descending
					.slice(0, maxArticlesPerSource),
		);

		// Sort the final list by quality (descending)
		const sortedLimitedArticles = limitedArticles.sort(
			(a, b) => b.quality - a.quality,
		);

		await writeDataIfNotExists(
			"articles-with-limited-sources.json",
			sortedLimitedArticles,
		);

		log("articles with limited sources", sortedLimitedArticles?.length);

		if (sortedLimitedArticles.length < MIN_NUMBER_OF_ARTICLES) {
			log("Not enough articles with limited sources on this attempt");
			throw new AppError(
				"Not enough articles with limited sources on this attempt",
			);
		}

		return sortedLimitedArticles;
	} catch (error) {
		if (error instanceof AppError) throw error;
		throw new AppError("Error in limitArticlesPerSource", { cause: error });
	}
}

function extractArticleFilteringData(
	articles: ArticleWithOptionalSourceAndCount[],
): ArticleWithSourceAndCount[] {
	try {
		return articles.map((article) => ({
			title: article.title,
			description: article.description ?? "",
			count: article.count,
			source: article.source ?? getSourceFromUrl(article.link),
			link: article.link,
		}));
	} catch (error) {
		log(`Error in getDataForAIFiltering: ${error}`);
		return [];
	}
}

export async function mergeFilteredArticles(
	articleData: ArticleWithOptionalSourceAndCount[],
	filteredArticles: CategorizedArticle[],
): Promise<ArticleWithQualityAndCategory[]> {
	try {
		const mergedArticles = filteredArticles.reduce<
			ArticleWithQualityAndCategory[]
		>((acc, { title, quality, category, description: updatedDescription }) => {
			const article = articleData.find((a) => a.title === title);
			if (article) {
				const { description: articleDescription, ...rest } = article;

				const description = updatedDescription ?? articleDescription;
				if (!description) {
					log(`No description found for ${title}`);
					return acc;
				}

				acc.push({
					...rest,
					description,
					quality,
					category,
				});
			}
			return acc;
		}, []);

		await writeTestData(["merged-ranked-article-data.json"], mergedArticles);

		if (mergedArticles.length < MIN_NUMBER_OF_ARTICLES) {
			log("Not enough mergedRankedArticles on this attempt");
			throw new AppError("Not enough mergedRankedArticles on this attempt");
		}

		log("merged ranked articles", mergedArticles.length);

		return mergedArticles;
	} catch (error) {
		if (error instanceof AppError) throw error;
		throw new AppError("Error in mergeFilteredArticles", { cause: error });
	}
}

interface WithTitleAndLink {
	title: string;
	link: string;
}

type WithTitleAndLinkAndCount<T> = T & {
	count: number;
};

export function deduplicateAndCountArticles<T extends WithTitleAndLink>(
	arr: T[],
	fields: (keyof T)[] = ["title", "link"],
): WithTitleAndLinkAndCount<T>[] {
	try {
		const uniqueMap = new Map<string, WithTitleAndLinkAndCount<T>>();

		for (const item of arr) {
			const key = fields
				.map((field) => `${String(field)}:${item[field]}`)
				.join("|");

			if (!uniqueMap.has(key)) {
				const existingItem = uniqueMap.get(key);
				if (!existingItem) {
					uniqueMap.set(key, { ...item, count: 1 });
				} else {
					uniqueMap.set(key, { ...item, count: existingItem.count + 1 });
				}
			}
		}

		const uniqueArticles = Array.from(uniqueMap.values());

		log("unfiltered unique articles", uniqueArticles.length);

		return uniqueArticles;
	} catch (error) {
		log(`Error in removeDuplicatesAndCount: ${error}`);
		return [];
	}
}

export function deduplicateArticles<T extends WithTitleAndLink>(
	arr: T[],
	fields: (keyof T)[] = ["title", "link"],
): T[] {
	try {
		const uniqueMap = new Map<string, T>();

		for (const item of arr) {
			const key = fields
				.map((field) => `${String(field)}:${item[field]}`)
				.join("|");

			if (!uniqueMap.has(key)) {
				uniqueMap.set(key, item);
			}
		}

		const uniqueArticles = Array.from(uniqueMap.values());

		log("Deduplicated articles", uniqueArticles.length);

		return uniqueArticles;
	} catch (error) {
		log(`Error in deduplicateArticles: ${error}`);
		return [];
	}
}
