import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import debug from "debug";
import puppeteer from "puppeteer";

import { createNewsletter, getNewsletter } from "src/db/routes/service.js";
import { initializeGenAI } from "../lib/ai.js";
import { BASE_PATH, SPECIFIC_PAGES } from "../lib/constants.js";
import { resend, sendTestEmail } from "../lib/email.js";
import { searchNews } from "../lib/google-search.js";
import { renderTemplate } from "../lib/template.js";
import { useLogFile, writeTestData } from "../lib/utils.js";
import type { NewsletterData, ValidArticleData } from "../types/index.js";
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

const log = debug(`${process.env.APP_NAME}:app:index.ts`);

const writeLog = useLogFile("run.log");

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
			"home care news medical",
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
		writeTestData("display-data-full.json", categories);
		log("categories generated", categories);

		const newsletter = await createNewsletter({ summary, categories });
		log("newsletter added to db", newsletter);

		log("newsletter data generated");
		return newsletter;
	} catch (error) {
		console.error(error);
	} finally {
		await browser.close();
	}
}

export async function sendNewsletterReviewEmail() {
	try {
		const newsletterData = await generateNewsletterData();

		if (!newsletterData) {
			throw new Error("Newsletter data not found");
		}

		const id = newsletterData?.id;
		if (!id) {
			throw new Error("Newsletter ID not found");
		}

		// TODO: send email to user to check if they want to approve the newsletter
		const { data, error } = await resend.emails.send({
			from: "Yats Support <support@yatusabes.co>",
			to: ["jack.watters@me.com", "jackwattersdev@gmail.com"],
			subject: "Review TrollyCare Newsletter",
			text: `Please review the newsletter and approve it if you want to receive it. link to newsletter: ${BASE_PATH}/newsletter/${id}`,
		});

		if (error) {
			return console.error({ error });
		}

		return { message: "Email sent successfully", data };
	} catch (error) {
		console.error(error);
	}
}

// TODO: this should be called when a new newsletter is approved
// TODO: add email part to this or new func
export async function generateNewsletter(id: number) {
	try {
		const newsletterData = await getNewsletter(id);

		log(newsletterData);

		if (
			!newsletterData ||
			!newsletterData.summary ||
			!newsletterData.categories ||
			!newsletterData.categories?.length
		) {
			throw new Error("Incomplete newsletter data");
		}

		// TODO: desc needs to not be null
		const template = await renderTemplate(newsletterData);

		writeLog("Newsletter generated successfully");

		return { message: "Newsletter generated successfully", html: template };
	} catch (error) {
		writeLog(`Error: ${error}`);

		console.error(error);
	}
}

export async function testGenerateNewsletter() {
	try {
		const categories = await fs.readFile(
			path.join(BASE_PATH, "tests", "data", "display-data-full.json"),
			"utf8",
		);

		const summary = await fs.readFile(
			path.join(BASE_PATH, "tests", "data", "summary.json"),
			"utf8",
		);

		const newsletterData: NewsletterData = {
			categories: JSON.parse(categories),
			summary: JSON.parse(summary),
		};

		log(newsletterData);

		if (
			!newsletterData ||
			!newsletterData.summary ||
			!newsletterData.categories?.length
		) {
			throw new Error("Incomplete newsletter data");
		}

		const template = await renderTemplate(newsletterData);

		writeLog("Newsletter generated successfully");

		return template;
	} catch (error) {
		writeLog(`Error: ${error}`);

		console.error(error);
	}
}

export default async function main() {
	try {
		const newsletter = await generateNewsletterData();

		log(newsletter);

		const html = await testGenerateNewsletter();

		if (!html) {
			throw new Error("Incomplete newsletter template");
		}

		log(html);

		await fs.writeFile("newsletter.html", html);

		const res = await sendTestEmail(html);
		// const res = await sendEmail(result);

		log(`Email sent with response: ${JSON.stringify(res)}`);
	} catch (error) {
		console.error("An error occurred in main:", error);
	}
}
// main();
