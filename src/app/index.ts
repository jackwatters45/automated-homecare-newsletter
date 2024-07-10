import "dotenv/config";

import debug from "debug";
import puppeteer from "puppeteer";

import { initializeGenAI } from "../lib/ai.js";
import { SPECIFIC_PAGES } from "../lib/constants.js";
import { writeTestData } from "../lib/utils.js";
import type { ValidArticleData } from "../types/index.js";
import { scrapeArticles } from "./data-fetching.js";
import {
	filterAndRankArticles,
	filterArticlesByPage,
} from "./data-filtering.js";
import {
	enrichArticlesData,
	generateCategories,
	generateSummary,
} from "./format-articles.js";
import { searchNews } from "./google-search.js";
import { renderTemplate } from "./template.js";

const log = debug(`${process.env.APP_NAME}:app:index.ts`);

export const model = initializeGenAI();

export async function generateNewsletterData() {
	log("generating newsletter data");

	const browser = await puppeteer.launch();
	try {
		const browserPage = await browser.newPage();

		const results: ValidArticleData[] = [];
		// specific pages
		for (const page of SPECIFIC_PAGES) {
			const articleLinks = await scrapeArticles(page, browserPage);
			const relevantArticles = await filterArticlesByPage(articleLinks, page);
			results.push(...relevantArticles);
		}

		// google search
		const googleSearchResults = await searchNews([
			"homecare news medical",
			"home health news medical",
		]);

		results.push(...googleSearchResults);

		if (results.length === 0) {
			throw new Error("No valid articles found");
		}

		await writeTestData("raw-article-data.json", results);
		log("raw articles generated", results.length);

		const articles = await filterAndRankArticles(results);

		await writeTestData("filtered-ranked-article-data.json", articles);
		log("filtered articles generated", articles.length);

		const articlesData = await enrichArticlesData(articles, browserPage);

		await writeTestData("display-article-data.json", articlesData);
		log("enriched articles generated", articlesData.length);

		const summary = await generateSummary(articlesData);
		log("summary generated");

		const categories = await generateCategories(articlesData);
		log("categories generated", categories);

		log("newsletter data generated");

		return { articlesData, summary };
	} catch (error) {
		console.error(error);
	} finally {
		await browser.close();
	}
}

export async function GenerateNewsletter() {
	try {
		const newsletterData = await generateNewsletterData();

		if (
			!newsletterData ||
			!newsletterData.summary ||
			newsletterData.articlesData.length < 10
		) {
			throw new Error("Incomplete newsletter data");
		}

		const template = await renderTemplate(newsletterData);

		// TODO: Implement email sending
		// const res = await sendEmail(result);
		// log(`Email sent with response: ${JSON.stringify(res)}`);

		return { message: "Newsletter generated successfully", html: template };
	} catch (error) {
		console.error(error);
	}
}

async function main() {
	try {
		await generateNewsletterData();
	} catch (error) {
		console.error("An error occurred in main:", error);
	}
}

// main();
