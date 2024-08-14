import "dotenv/config";

import debug from "debug";

import { CLIENT_URL, REVIEWER_EMAIL } from "../lib/constants.js";
import { resend } from "../lib/email.js";

import { eq } from "drizzle-orm/expressions";
import { createNewsletter, getNewsletter } from "../api/service.js";
import { db } from "../db/index.js";
import { newsletters } from "../db/schema.js";
import logger from "../lib/logger.js";
import { renderTemplate } from "../lib/template.js";
import { getEnv } from "../lib/utils.js";
import type { PopulatedNewNewsletter } from "../types/index.js";
import { getArticleData } from "./data-fetching.js";
import { filterAndRankArticles } from "./data-filtering.js";
import {
	enrichArticlesData,
	generateCategories,
	generateSummary,
} from "./format-articles.js";

const log = debug(`${process.env.APP_NAME}:app:index.ts`);

export async function generateNewsletterData(): Promise<
	PopulatedNewNewsletter | undefined
> {
	log("generating newsletter data");

	try {
		const results = await getArticleData();

		const articles = await filterAndRankArticles(results);

		log("articles filtered and ranked", articles);

		const articlesData = await enrichArticlesData(articles);

		const summary = await generateSummary(articlesData);

		const articlesWithCategories = await generateCategories(articlesData);

		const newsletter = await createNewsletter({
			summary,
			articles: articlesWithCategories,
		});

		log("newsletter data generated", newsletter);
		return newsletter;
	} catch (error) {
		logger.error("Error in generateNewsletterData:", { error });
		throw error;
	}
}

export async function sendNewsletterReviewEmail() {
	try {
		const newsletterData = await generateNewsletterData();

		if (!newsletterData) {
			logger.error("Newsletter data not found");
			throw new Error("Newsletter data not found");
		}

		const id = newsletterData?.id;
		if (!id) {
			logger.error("Newsletter ID not found");
			throw new Error("Newsletter ID not found");
		}

		const { data, error } = await resend.emails.send({
			from: getEnv("RESEND_FROM_EMAIL"),
			to: REVIEWER_EMAIL,
			subject: "Review TrollyCare Newsletter",
			text: `Please review the newsletter and approve it before it is sent. link to newsletter: ${CLIENT_URL}/newsletter/${id}`,
		});

		if (error) {
			return logger.error("Error in sendNewsletterReviewEmail:", { error });
		}

		return data;
	} catch (error) {
		logger.error("Error in sendNewsletterReviewEmail:", { error });
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
		logger.error("Error in generateNewsletterTemplate:", { error });
	}
}

export async function sendNewsletter(id: number) {
	try {
		const html = await generateNewsletterTemplate(id);

		if (!html) {
			logger.error("Incomplete newsletter template");
			throw new Error("Incomplete newsletter template");
		}

		const { recipients } = await getNewsletter(id);

		const recipientEmails = recipients.map((recipient) => recipient.email);

		const { data, error } = await resend.emails.send({
			from: getEnv("RESEND_FROM_EMAIL"),
			to: recipientEmails,
			subject: `TrollyCare Newsletter - ${new Date().toLocaleDateString()}`,
			html,
		});

		if (error) {
			const updatedNewsletter = await db
				.update(newsletters)
				.set({ status: "FAILED" })
				.where(eq(newsletters.id, id))
				.returning();

			logger.error("Error in sendNewsletter:", { error });

			return {
				message: "Error sending email",
				error,
				newsletter: updatedNewsletter,
			};
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
		logger.error("Error in sendNewsletter:", { error });
	}
}
