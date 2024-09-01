import "dotenv/config";

import debug from "debug";

import { CLIENT_URL } from "../lib/constants.js";
import { resend } from "../lib/email.js";

import { eq } from "drizzle-orm/expressions";
import {
	createNewsletter,
	getAllReviewerEmails,
	getNewsletter,
} from "../api/service.js";
import { db } from "../db/index.js";
import { newsletters } from "../db/schema.js";
import logger from "../lib/logger.js";
import { renderTemplate } from "../lib/template.js";
import { getEnv, retry } from "../lib/utils.js";
import type { NewNewsletter } from "../types/index.js";
import { getArticleData } from "./data-fetching.js";
import { filterAndRankArticles } from "./data-filtering.js";
import { generateSummary } from "./format-articles.js";

const log = debug(`${process.env.APP_NAME}:app:index.ts`);

async function generateNewsletterArticles() {
	try {
		const results = await getArticleData();
		if (!results) throw new Error("No articles found");

		const articles = await filterAndRankArticles(results);
		if (!articles) throw new Error("No articles found");

		return articles;
	} catch (error) {
		logger.error("Error in generateNewsletterArticles:", { error });
		throw error;
	}
}

export async function generateNewsletterData(): Promise<
	NewNewsletter | undefined
> {
	log("generating newsletter data");

	try {
		const articlesData = await generateNewsletterArticles();

		const summary = await generateSummary(articlesData);

		const newsletter = await createNewsletter({
			summary,
			articles: articlesData,
		});

		log("newsletter data generated", newsletter.articles.length);

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

		retry(async () => {
			const reviewers = await getAllReviewerEmails();

			const { data, error } = await resend.emails.send({
				from: getEnv("RESEND_FROM_EMAIL"),
				to: reviewers,
				subject: "Review TrollyCare Newsletter",
				text: `Please review the newsletter and approve it before it is sent. link to newsletter: ${CLIENT_URL}/newsletters/${id}`,
			});

			if (error) {
				return logger.error("Error in sendNewsletterReviewEmail:", { error });
			}

			return {
				newsletter: newsletterData,
				data,
				message: "Email sent successfully",
			};
		});
	} catch (error) {
		logger.error("Error in sendNewsletterReviewEmail:", { error });
		return { message: "Error sending email", error };
	}
}

export async function sendNewsletterReviewEmailById(id: number) {
	try {
		const newsletterData = await getNewsletter(id);

		if (!newsletterData) {
			logger.error("Newsletter data not found");
			throw new Error("Newsletter data not found");
		}

		const reviewers = await getAllReviewerEmails();

		const { data, error } = await resend.emails.send({
			from: getEnv("RESEND_FROM_EMAIL"),
			to: reviewers,
			subject: "Review TrollyCare Newsletter",
			text: `Please review the newsletter and approve it before it is sent. link to newsletter: ${CLIENT_URL}/newsletters/${id}`,
		});

		if (error) {
			return logger.error("Error in sendNewsletterReviewEmail:", { error });
		}

		return {
			newsletter: newsletterData,
			data,
			message: "Email sent successfully",
		};
	} catch (error) {
		logger.error("Error in sendNewsletterReviewEmail:", { error });
		return { message: "Error sending email", error };
	}
}

export async function sendNewsletter(id: number) {
	try {
		const newsletterData = await getNewsletter(id);

		for (const recipient of newsletterData.recipients) {
			const html = await renderTemplate({
				data: newsletterData,
				recipientEmail: recipient.email,
			});

			if (!html) {
				logger.error("Incomplete newsletter template");
				throw new Error("Incomplete newsletter template");
			}

			const { error } = await resend.emails.send({
				from: getEnv("RESEND_FROM_EMAIL"),
				to: recipient.email,
				subject: `TrollyCare Newsletter - ${new Date().toLocaleDateString()}`,
				html,
			});

			if (error) {
				throw new Error("Error sending email");
			}
		}

		const updatedNewsletter = await db
			.update(newsletters)
			.set({ status: "SENT" })
			.where(eq(newsletters.id, id))
			.returning();

		return {
			message: "Email sent successfully",
			newsletter: updatedNewsletter,
		};
	} catch (error) {
		await db
			.update(newsletters)
			.set({ status: "FAILED" })
			.where(eq(newsletters.id, id))
			.returning();

		logger.error("Error in sendNewsletter:", { error });
	}
}
