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
import { AppError, NotFoundError } from "../lib/errors.js";
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
		if (!results) throw new AppError("Error fetching articles");

		const articles = await filterAndRankArticles(results);
		if (!articles) throw new AppError("Error filtering articles");

		return articles;
	} catch (error) {
		if (error instanceof AppError) throw error;
		throw new AppError("Error in generateNewsletterArticles", { cause: error });
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
		if (error instanceof AppError) throw error;
		throw new AppError("Error in generateNewsletterData", { cause: error });
	}
}

export async function sendNewsletterReviewEmail() {
	try {
		const newsletterData = await generateNewsletterData();

		if (!newsletterData) {
			throw new NotFoundError("Newsletter data not found", { newsletterData });
		}

		const id = newsletterData?.id;
		if (!id) {
			throw new NotFoundError("Newsletter ID not found", { newsletterData });
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
				throw new AppError("Error sending email", { cause: error });
			}

			return {
				newsletter: newsletterData,
				data,
				message: "Email sent successfully",
			};
		});
	} catch (error) {
		if (error instanceof AppError) throw error;
		throw new AppError("Error in sendNewsletterReviewEmail", { cause: error });
	}
}

export async function sendNewsletterReviewEmailById(id: number) {
	try {
		const newsletterData = await getNewsletter(id);

		if (!newsletterData) {
			throw new NotFoundError("Newsletter data not found", { newsletterData });
		}

		const reviewers = await getAllReviewerEmails();

		const { data, error } = await resend.emails.send({
			from: getEnv("RESEND_FROM_EMAIL"),
			to: reviewers,
			subject: "Review TrollyCare Newsletter",
			text: `Please review the newsletter and approve it before it is sent. link to newsletter: ${CLIENT_URL}/newsletters/${id}`,
		});

		if (error) {
			throw new AppError("Error sending email", { cause: error });
		}

		return {
			newsletter: newsletterData,
			data,
			message: "Email sent successfully",
		};
	} catch (error) {
		if (error instanceof AppError) throw error;
		throw new AppError("Error in sendNewsletterReviewEmail", { cause: error });
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
				throw new AppError("Incomplete newsletter template", { recipient });
			}

			const { error } = await resend.emails.send({
				from: getEnv("RESEND_FROM_EMAIL"),
				to: recipient.email,
				subject: `TrollyCare Newsletter - ${new Date().toLocaleDateString()}`,
				html,
			});

			if (error) {
				throw new AppError("Error sending email", { cause: error });
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

		if (error instanceof AppError) throw error;
		throw new AppError("Error in sendNewsletter", { cause: error });
	}
}
