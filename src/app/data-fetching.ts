import * as cheerio from "cheerio";
import debug from "debug";

import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { getCache, setCache } from "../lib/cache.js";
import {
	CACHE_KEY,
	INITIAL_FETCH_COUNT,
	IS_DEVELOPMENT,
	SPECIFIC_PAGES,
	SYSTEM_INSTRUCTION,
} from "../lib/constants.js";
import { searchNews } from "../lib/google-search.js";
import logger from "../lib/logger.js";
import { rateLimiter } from "../lib/rate-limit.js";
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
}

export async function fetchGoogleSearchResults(): Promise<BaseArticle[]> {
	try {
		const googleSearchResults = await searchNews([
			// General industry news
			"homecare industry news",
			"home-based care updates",

			// Policy and regulations
			"homecare policy updates",
			"home-based care legislation",

			// Technology and innovations
			"homecare technology innovations",
			"digital solutions in homecare",
			"telecare advancements",

			// Workforce and trends
			"homecare workforce trends",
			"caregiver recruitment homecare",
			"in-home care staffing solutions",

			// Clinical practices
			"homecare best practices",
			"in-home care clinical innovations",

			// Business operations
			"homecare agency management",
			"in-home care financial trends",

			// Specific care areas
			"elder homecare news",
			"pediatric in-home care",
			"chronic care management at home",

			// Industry events
			"homecare industry conferences",
			"in-home care webinars",
		]);

		if (!googleSearchResults || !googleSearchResults.length) {
			logger.error("No results found in Google search");
			throw new Error("No results found in Google search");
		}

		log("google search results count", googleSearchResults.length);

		return googleSearchResults;
	} catch (error) {
		logger.error("Error in fetchGoogleSearchResults:", { error });
		throw error;
	}
}

async function fetchSpecificPageResults(): Promise<
	ArticleWithOptionalSource[]
> {
	const specificPageResults: ArticleWithOptionalSource[] = [];
	for (const page of SPECIFIC_PAGES) {
		const articleLinks = await scrapeArticles(page);
		const relevantArticles = await filterArticlesByPage(articleLinks, page);
		specificPageResults.push(...relevantArticles);
	}

	log("specific page results count", specificPageResults.length);

	if (specificPageResults.length === 0) {
		logger.error("No valid articles found");
		throw new Error("No valid articles found");
	}

	return specificPageResults;
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
	const rawHref = $(element).find(targetPage.linkSelector).attr("href");

	let description = extractTextContent(
		$,
		element,
		targetPage.descriptionSelector,
	);

	if (!description && getDescription) {
		const descriptionPrompt = createDescriptionPrompt($.html());

		const { text } = await generateText({
			model: google("gemini-1.5-flash-latest"),
			system: SYSTEM_INSTRUCTION,
			prompt: descriptionPrompt,
		});

		logAiCall();

		description = text?.trim();
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
}

async function fetchFromAdditionalSources(): Promise<BaseArticle[]> {
	const additionalResults = await searchNews(
		[
			"home health industry news",
			"homecare technology updates",
			"home health policy changes",
		],
		3,
	);

	return additionalResults;
}
