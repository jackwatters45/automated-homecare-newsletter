import * as cheerio from "cheerio";
import debug from "debug";

import { getAllBlacklistedDomainNames } from "../api/service.js";
import { generateAITextResponse } from "../lib/ai.js";
import { getCache, setCache } from "../lib/cache.js";
import {
	CACHE_KEY,
	INITIAL_FETCH_COUNT,
	IS_DEVELOPMENT,
	SPECIFIC_PAGES,
} from "../lib/constants.js";
import { AppError, NetworkError, NotFoundError } from "../lib/errors.js";
import { searchNews } from "../lib/google-search.js";
import logger from "../lib/logger.js";
import {
	checkRobotsTxtPermission,
	constructFullUrl,
	extractDate,
	extractTextContent,
	fetchPageContent,
	logAiCall,
	readTestData,
	retry,
	writeDataIfNotExists,
} from "../lib/utils.js";
import type {
	ArticleData,
	ArticleWithOptionalSource,
	ArticleWithSource,
	BaseArticle,
	PageToScrape,
} from "../types/index.js";
import { filterArticlesByPage } from "./data-filtering.js";
import { createDescriptionPrompt } from "./format-articles.js";

const log = debug(`${process.env.APP_NAME}:data-fetching.ts`);

export async function getArticleData() {
	try {
		if (IS_DEVELOPMENT) {
			// if development, read test data
			log("reading test data");
			const testData = await readTestData<ArticleWithSource[]>(
				"raw-article-data.json",
			);
			if (testData) return testData;
			log("No test data found, falling back to live data");
		} else {
			// Check Upstash Redis cache first
			const cachedData = await getCache(CACHE_KEY);
			if (cachedData) {
				log("Using cached article data from Upstash Redis");
				return cachedData;
			}
		}

		const [googleResults, specificPageResults] = await Promise.all([
			fetchGoogleSearchResults(),
			fetchSpecificPageResults(),
		]);

		const results: ArticleWithOptionalSource[] = [
			...googleResults,
			...specificPageResults,
		];

		if (results.length < INITIAL_FETCH_COUNT) {
			const additionalResults = await fetchFromAdditionalSources();
			results.push(...additionalResults);
		}

		await setCache(CACHE_KEY, results);
		await writeDataIfNotExists("raw-article-data.json", results);

		return results;
	} catch (error) {
		if (error instanceof AppError) throw error;
		throw new AppError("Failed to fetch article data", { cause: error });
	}
}

const searchQueries = [
	"homecare ai",
	"homecare legislation",
	"homecare best practices",
	"homecare workforce challenges",
	"homecare telemedicine integration",
	"homecare remote monitoring tools",
	"homecare caregiver burnout strategies",
	"homecare caregiver burnout prevention",
	"homecare AI-driven decision support",
	"homecare fall prevention technology",
];

export async function fetchGoogleSearchResults(): Promise<BaseArticle[]> {
	try {
		const googleSearchResults = await searchNews(searchQueries);

		if (!googleSearchResults || !googleSearchResults.length) {
			throw new NotFoundError("No results found in Google search");
		}

		log("google search results count", googleSearchResults.length);

		return googleSearchResults;
	} catch (error) {
		if (error instanceof NotFoundError) throw error;
		throw new NetworkError("Failed to fetch Google search results", {
			cause: error,
			searchQueries,
		});
	}
}

async function fetchSpecificPageResults(): Promise<
	ArticleWithOptionalSource[]
> {
	try {
		const specificPageResults: ArticleWithOptionalSource[] = [];

		const blacklistedDomains = await getAllBlacklistedDomainNames();
		const filteredSpecificPages = SPECIFIC_PAGES.filter((page) => {
			return !blacklistedDomains.some((domain) => page.url.includes(domain));
		});

		for (const page of filteredSpecificPages) {
			const articleLinks = await scrapeArticles(page);
			const relevantArticles = await filterArticlesByPage(articleLinks, page);
			specificPageResults.push(...relevantArticles);
		}

		log("specific page results count", specificPageResults.length);

		if (specificPageResults.length === 0) {
			throw new NotFoundError("No valid articles found from specific pages", {
				pages: filteredSpecificPages,
			});
		}

		return specificPageResults;
	} catch (error) {
		if (error instanceof NotFoundError) throw error;
		throw new AppError("Failed to fetch specific page results", {
			cause: error,
		});
	}
}

export async function scrapeArticles(targetPage: PageToScrape) {
	try {
		const isScrapingAllowed = await checkRobotsTxtPermission(targetPage.url);
		if (!isScrapingAllowed) {
			log(`Scraping disallowed by robots.txt for ${targetPage.url}`);
			return [];
		}

		const pageContent = await retry(() => fetchPageContent(targetPage.url));

		if (!pageContent) {
			log("Page content is empty");
			return [];
		}

		const $ = cheerio.load(pageContent);

		const articlePromises = $(targetPage.articleContainerSelector)
			.map((_, element) => extractArticleData({ targetPage, $, element }))
			.get();

		const articles = await Promise.all(articlePromises);

		return articles.filter((article) => !!article);
	} catch (error) {
		logger.error("Error in scrapeArticles:", {
			error,
			targetPage,
		});
		return [];
	}
}

interface ArticleExtractionParams {
	targetPage: PageToScrape;
	$: cheerio.CheerioAPI;
	element: cheerio.AnyNode;
	getDescription?: boolean;
}

export async function extractArticleData({
	targetPage,
	$,
	element,
	getDescription = false,
}: ArticleExtractionParams): Promise<ArticleData | null> {
	try {
		const rawHref = $(element).find(targetPage.linkSelector).attr("href");

		let description = extractTextContent(
			$,
			element,
			targetPage.descriptionSelector,
		);

		if (!description && getDescription) {
			const descriptionPrompt = createDescriptionPrompt($.html());

			const { content } = await generateAITextResponse({
				prompt: descriptionPrompt,
			});

			logAiCall();

			description = content?.trim();
		}

		const link = constructFullUrl(rawHref, targetPage);
		const title = extractTextContent($, element, targetPage.titleSelector);
		if (!title || !link) {
			return null;
		}

		return {
			link: link,
			title: title,
			description: description,
			date: extractDate($, element, targetPage.dateSelector),
		};
	} catch (error) {
		logger.error("Error in extractArticleData:", {
			error,
			targetPage,
		});
		return null;
	}
}

async function fetchFromAdditionalSources(): Promise<BaseArticle[]> {
	try {
		const additionalResults = await searchNews(
			[
				"home health industry news",
				"homecare technology updates",
				"home health policy changes",
			],
			3,
		);

		if (additionalResults.length === 0) {
			throw new NotFoundError("No additional results found", {
				queries: [
					"home health industry news",
					"homecare technology updates",
					"home health policy changes",
				],
			});
		}

		return additionalResults;
	} catch (error) {
		if (error instanceof AppError) throw error;
		throw new NetworkError("Failed to fetch from additional sources", {
			cause: error,
		});
	}
}
