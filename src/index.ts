import "dotenv/config";

import { promises as fs } from "node:fs";
import path from "node:path";
import debug from "debug";
import puppeteer from "puppeteer";

import type { ValidArticleData } from "../types";
import {
	filterArticlesByPage,
	rankAndFilterArticles,
} from "./data/data-filtering";
import { enrichArticlesData } from "./data/format-articles";
import { renderTemplate } from "./display/template";
import { initializeGenAI } from "./lib/ai";
import { SPECIFIC_PAGES } from "./lib/constants";
import { runWeekly } from "./lib/cron";

const log = debug(`${process.env.APP_NAME}:index.ts`);

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

async function main() {
	runWeekly(async () => {
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
		} catch (error) {
			console.error(error);
		}
	});
}

main().catch((error) => {
	console.error("Unhandled error in main script:", error);
	process.exit(1);
});

import { Resend } from "resend";
import {} from "../types";
import { scrapeArticles } from "./data/data-fetching";
import { searchNews } from "./data/google-search";
const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(html: string, to = "jack.watters@me.com") {
	const date = new Date();
	const formattedDate = date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	const { data, error } = await resend.emails.send({
		from: "Yats Support <support@yatusabes.co>",
		to,
		subject: `Test Newsletter' - ${formattedDate}`,
		html,
	});

	if (error) {
		return console.error({ error });
	}

	return new Response(
		JSON.stringify({ message: "Email sent successfully", data }),
	);
}

// "You are a homecare business operator. You are tasked with choosing which articles to include in a newsletter. You will be provided with a list of about 200 articles and their metadata. Your job is to filter out articles that are not relevant to the topic of home health. You should reduce the list to the 30 most relevant and interesting articles. Please order the articles by relevance score, with the highest score being the first in the list. Return the filtered list of articles as a JSON array.",

// async function analyzeAndRankArticles(
// 	articles: Article[],
// 	topic: string,
// 	numTopArticles = 10,
// ): Promise<Article[]> {
// 	const rankedArticles = await Promise.all(
// 		articles.map(async (article) => ({
// 			...article,
// 			relevanceScore: await rankArticle(article.content, topic),
// 		})),
// 	);

// 	return rankedArticles
// 		.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
// 		.slice(0, numTopArticles);
// }
