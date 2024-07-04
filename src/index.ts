import "dotenv/config";

import { promises as fs } from "node:fs";
import path from "node:path";
import debug from "debug";

import { renderTemplate } from "./app/template";
import { runWeekly } from "./lib/cron";

const log = debug(`${process.env.APP_NAME}:index.ts`);

async function main() {
	runWeekly(async () => {
		retry(async () => {
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
	});
}

retry(main).catch((error) => {
	console.error("Unhandled error in main script:", error);
	process.exit(1);
});

import { Resend } from "resend";
import { generateNewsletterData } from "./app";
import { scrapeArticles } from "./app/data-fetching";
import { searchNews } from "./app/google-search";
import { retry } from "./lib/utils";
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail(html: string, to = "jack.watters@me.com") {
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
