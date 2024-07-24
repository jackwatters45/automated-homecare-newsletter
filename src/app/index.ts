import "dotenv/config";

import debug from "debug";
import puppeteer from "puppeteer";

import { initializeGenAI } from "../lib/ai.js";
import {
	CLIENT_URL,
	REVIEWER_EMAIL,
	SPECIFIC_PAGES,
} from "../lib/constants.js";
import { resend } from "../lib/email.js";

import { eq } from "drizzle-orm";
import { createNewsletter, getNewsletter } from "../api/service.js";
import { db } from "../db/index.js";
import { newsletters } from "../db/schema.js";
import { renderTemplate } from "../lib/template.js";
import type { PopulatedNewNewsletter } from "../types/index.js";
import { getArticleData } from "./data-fetching.js";
import { filterAndRankArticles } from "./data-filtering.js";
import {
	enrichArticlesData,
	generateCategories,
	generateSummary,
} from "./format-articles.js";

const log = debug(`${process.env.APP_NAME}:app:index.ts`);

export const model = initializeGenAI();

export async function generateNewsletterData(): Promise<
	PopulatedNewNewsletter | undefined
> {
	log("generating newsletter data");

	const browser = await puppeteer.launch();
	const browserPage = await browser.newPage();

	try {
		const results = await getArticleData(SPECIFIC_PAGES, browserPage);

		const articles = await filterAndRankArticles(results);

		const articlesData = await enrichArticlesData(articles, browserPage);

		const summary = await generateSummary(articlesData);

		const categories = await generateCategories(articlesData);

		const newsletter = await createNewsletter({ summary, categories });

		log("newsletter data generated", newsletter);
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

		// TODO: send email to <user>
		const { data, error } = await resend.emails.send({
			from: "Yats Support <support@yatusabes.co>",
			to: REVIEWER_EMAIL,
			subject: "Review TrollyCare Newsletter",
			text: `Please review the newsletter and approve it before it is sent. link to newsletter: ${CLIENT_URL}/newsletter/${id}`,
		});

		if (error) {
			return console.error({ error });
		}

		return data;
	} catch (error) {
		console.error(error);
		return { message: "Error sending email", error };
	}
}

export async function generateNewsletterTemplate(id: number) {
	try {
		const newsletterData = await getNewsletter(id);

		log(newsletterData);

		const template = await renderTemplate(newsletterData);

		return template;
	} catch (error) {
		console.error(error);
	}
}

export async function sendNewsletter(id: number) {
	try {
		const html = await generateNewsletterTemplate(id);

		if (!html) {
			throw new Error("Incomplete newsletter template");
		}

		const { data, error } = await resend.emails.send({
			from: "Yats Support <support@yatusabes.co>",
			to: ["jack.watters@me.com", "jackwattersdev@gmail.com"],
			subject: `TrollyCare Newsletter - ${new Date().toLocaleDateString()}`,
			html,
		});

		if (error) {
			const updatedNewsletter = await db
				.update(newsletters)
				.set({ status: "FAILED" })
				.where(eq(newsletters.id, id))
				.returning();

			return console.error({ error });
		}

		const updatedNewsletter = await db
			.update(newsletters)
			.set({ status: "SENT" })
			.where(eq(newsletters.id, id))
			.returning();

		return {
			message: "Email sent successfully",
			email: data,
			newsletter: updatedNewsletter,
		};
	} catch (error) {
		console.error("An error occurred in main:", error);
	}
}
