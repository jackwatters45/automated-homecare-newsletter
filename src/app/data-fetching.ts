import * as cheerio from "cheerio";
import debug from "debug";

import { getCache, setCache } from "../lib/cache.js";
import {
	CACHE_KEY,
	INITIAL_FETCH_COUNT,
	IS_DEVELOPMENT,
	SPECIFIC_PAGES,
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
	generateJSONResponseFromModel,
	readTestData,
	retry,
	writeDataIfNotExists,
} from "../lib/utils.js";
import type { PageToScrape, ValidArticleData } from "../types/index.js";
import { filterArticlesByPage } from "./data-filtering.js";
import { createDescriptionPrompt } from "./format-articles.js";

const log = debug(`${process.env.APP_NAME}:data-fetching.ts`);

export async function getArticleData() {
	// if development, read test data
	if (IS_DEVELOPMENT) {
		log("reading test data");
		return await readTestData<ValidArticleData[]>("raw-article-data.json");
	}

	// Check Upstash Redis cache first
	const cachedData = await getCache(CACHE_KEY);
	if (cachedData) {
		log("Using cached article data from Upstash Redis");
		return cachedData;
	}

	const results: ValidArticleData[] = [];

	// google search
	const googleSearchResults = await retry(async () => {
		return await searchNews([
			"homecare news",
			"home health care industry news",
			"homecare policy updates",
			"home health technology innovations",
			"medicare home health changes",
			"home health care workforce trends",
			"telehealth in home care",
			"home health reimbursement news",
			"aging in place healthcare news",
			"home health regulatory updates",
			"patient-centered home care news",
			"home health quality measures",
			"home health value-based care",
			"chronic care management at home",
			"home health mergers and acquisitions",
			"remote patient monitoring home care",
		]);
	});

	if (!googleSearchResults || !googleSearchResults.length) {
		throw new Error("No results found in Google search");
	}

	log("google search results count", googleSearchResults.length);

	results.push(...googleSearchResults);

	// specific pages
	const specificPageResults = [];
	for (const page of SPECIFIC_PAGES) {
		const articleLinks = await scrapeArticles(page);
		const relevantArticles = await filterArticlesByPage(articleLinks, page);
		specificPageResults.push(...relevantArticles);
	}

	log("specific page results count", specificPageResults.length);

	results.push(...specificPageResults);

	if (results.length < INITIAL_FETCH_COUNT) {
		const additionalResults = await fetchFromAdditionalSources();
		results.push(...additionalResults);
	}

	if (results.length === 0) {
		logger.error("No valid articles found");
		throw new Error("No valid articles found");
	}

	await setCache(CACHE_KEY, results);
	await writeDataIfNotExists("raw-article-data.json", results);

	return results;
}

async function fetchFromAdditionalSources(): Promise<ValidArticleData[]> {
	const additionalResults = await searchNews([
		"home health industry news",
		"homecare technology updates",
		"home health policy changes",
	]);

	return additionalResults;
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

		return await Promise.all(articlePromises);
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
}

export async function extractArticleData({
	targetPage,
	$,
	element,
}: ArticleExtractionParams) {
	const rawHref = $(element).find(targetPage.linkSelector).attr("href");

	let description = extractTextContent(
		$,
		element,
		targetPage.descriptionSelector,
	);

	if (!description) {
		const descriptionPrompt = createDescriptionPrompt($.html());

		const generatedDescription = await rateLimiter.schedule(() =>
			retry<string>(() => generateJSONResponseFromModel(descriptionPrompt)),
		);

		description = generatedDescription?.trim();
	}

	return {
		url: targetPage.url,
		link: constructFullUrl(rawHref, targetPage),
		title: extractTextContent($, element, targetPage.titleSelector),
		description: extractTextContent($, element, targetPage.descriptionSelector),
		date: extractDate($, element, targetPage.dateSelector),
	};
}
