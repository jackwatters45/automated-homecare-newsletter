import "dotenv/config";

import debug from "debug";

import { eq } from "drizzle-orm/expressions";
import {
	addNewsletterToDB,
	getAllReviewerEmails,
	getNewsletter,
} from "../api/service.js";
import { db } from "../db/index.js";
import { newsletters } from "../db/schema.js";
import { sendTransactionalEmail } from "../lib/aws-ses.js";
import { CLIENT_URL, MAX_ARTICLES_PER_TYPE } from "../lib/constants.js";
import { AppError, NotFoundError } from "../lib/errors.js";
import { createAndSendCampaign } from "../lib/mailchimp.js";
import { renderTemplate } from "../lib/template.js";
import { retry, shuffleArray } from "../lib/utils.js";
import type {
	ArticleWithQualityAndCategory,
	NewNewsletter,
	ProcessedArticle,
} from "../types/index.js";
import {
	fetchGoogleResults,
	fetchSpecificSiteResults,
} from "./data-fetching.js";
import {
	filterAndRankGoogleArticles,
	filterAndRankSpecificSiteArticles,
	redistributeArticles,
} from "./data-filtering.js";
import { generateSummary } from "./format-articles.js";

const log = debug(`${process.env.APP_NAME}:app:index.ts`);

export async function generateNewsletterData() {
	// Fetch results
	const [rawGoogleResults, rawSpecificSiteResults] = await Promise.all([
		fetchGoogleResults(),
		fetchSpecificSiteResults(),
	]);

	// Filter and rank results
	const rankedGoogleArticles =
		await filterAndRankGoogleArticles(rawGoogleResults);
	const rankedSpecificSiteArticles = await filterAndRankSpecificSiteArticles(
		rawSpecificSiteResults,
	);

	// Combine results
	const combinedArticles = combineAndBalanceArticles(
		rankedGoogleArticles,
		rankedSpecificSiteArticles,
	);

	const redistributedArticles = await redistributeArticles(combinedArticles);

	// Generate summary
	const summary = await generateSummary(combinedArticles);

	// Shuffle combined articles
	const shuffleCombinedArticles = shuffleArray(redistributedArticles);

	return {
		summary,
		articles: shuffleCombinedArticles,
	};
}

function combineAndBalanceArticles(
	googleArticles: ArticleWithQualityAndCategory[],
	specificSiteArticles: ArticleWithQualityAndCategory[],
): ProcessedArticle[] {
	const combinedArticles = [
		...googleArticles.slice(0, MAX_ARTICLES_PER_TYPE),
		...specificSiteArticles.slice(0, MAX_ARTICLES_PER_TYPE),
	].sort((a, b) => b.quality - a.quality);

	return combinedArticles.map((article, index) => ({
		...article,
		finalRank: index,
	}));
}

export async function createNewsletter(): Promise<NewNewsletter | undefined> {
	log("generating newsletter data");

	try {
		const newsletterData = await retry(() => generateNewsletterData());

		const newsletter = await retry(() => addNewsletterToDB(newsletterData));

		log("newsletter data generated", newsletter.articles.length);

		return newsletter;
	} catch (error) {
		if (error instanceof AppError) throw error;
		throw new AppError("Error in generateNewsletterData", { cause: error });
	}
}

export async function sendNewsletterReviewEmail() {
	try {
		const newsletterData = await createNewsletter();

		if (!newsletterData) {
			throw new NotFoundError("Newsletter data not found", { newsletterData });
		}

		const id = newsletterData?.id;
		if (!id) {
			throw new NotFoundError("Newsletter ID not found", { newsletterData });
		}

		retry(async () => {
			const reviewers = await getAllReviewerEmails();

			const res = await sendTransactionalEmail({
				subject: "Review TrollyCare Newsletter",
				text: `Please review the newsletter and approve it before it is sent. link to newsletter: ${CLIENT_URL}/newsletters/${id}`,
				to: reviewers,
			});

			return {
				newsletter: newsletterData,
				emailResult: res,
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

		const res = await sendTransactionalEmail({
			subject: "Review TrollyCare Newsletter",
			text: `Please review the newsletter and approve it before it is sent. link to newsletter: ${CLIENT_URL}/newsletters/${id}`,
			to: reviewers,
		});

		return {
			newsletter: newsletterData,
			emailResult: res,
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

		const html = await renderTemplate({
			data: newsletterData,
		});

		const campaignId = await createAndSendCampaign(html);

		const updatedNewsletter = await db
			.update(newsletters)
			.set({ status: "SENT", mailChimpId: campaignId })
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
