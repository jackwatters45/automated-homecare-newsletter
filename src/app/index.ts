import "dotenv/config";

import { promises as fs } from "node:fs";
import path from "node:path";
import debug from "debug";
import puppeteer from "puppeteer";

import { initializeGenAI } from "@/lib/ai";
import { SPECIFIC_PAGES } from "@/lib/constants";
import { scrapeArticles } from "./data-fetching";
import { filterArticlesByPage, rankAndFilterArticles } from "./data-filtering";

import type { ValidArticleData } from "types";
import { enrichArticlesData } from "./format-articles";
import { searchNews } from "./google-search";
import { renderTemplate } from "./template";

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
			"homecare news",
			"home health news",
		]);
		results.push(...googleSearchResults);

		if (results.length === 0) {
			throw new Error("No valid articles found");
		}

		const relevantArticles = await rankAndFilterArticles(results);

		const newsletterData = await enrichArticlesData(
			relevantArticles,
			browserPage,
		);

		log("newsletter data generated");

		return newsletterData;
	} catch (error) {
		console.error(error);
	} finally {
		await browser.close();
	}
}

export async function GenerateNewsletter() {
	try {
		const newsletterData = await generateNewsletterData();

		if (!newsletterData || newsletterData.length === 0) {
			throw new Error("No newsletter data generated");
		}

		const template = await renderTemplate(newsletterData);

		const outputPath = path.join(path.resolve(), "public", "newsletter.html");
		await fs.writeFile(outputPath, template);
		log(`Newsletter written to ${outputPath}`);

		// TODO: Implement email sending
		// const res = await sendEmail(result);
		// log(`Email sent with response: ${JSON.stringify(res)}`);

		return { message: "Newsletter generated successfully", path: outputPath };
	} catch (error) {
		console.error(error);
	}
}
