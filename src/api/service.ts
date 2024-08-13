import { eq, inArray, not } from "drizzle-orm/expressions";
import { db } from "../db/index.js";
import {
	articles,
	newsletterRecipients,
	newsletters,
	recipients,
} from "../db/schema.js";
import { DatabaseError } from "../lib/errors.js";
import type {
	Article,
	ArticleInputWithCategory,
	PopulatedNewNewsletter,
} from "../types/index.js";

import debug from "debug";
import logger from "../lib/logger.js";

const log = debug(`${process.env.APP_NAME}:routes/api/service.ts`);

export async function getAllNewslettersWithRecipients() {
	try {
		return await db.query.newsletters
			.findMany({
				with: {
					recipients: {
						columns: {},
						with: {
							recipient: true,
						},
					},
				},
			})
			.then((newsletters) =>
				newsletters.map((newsletter) => ({
					...newsletter,
					recipients: newsletter.recipients.map((nr) => nr.recipient),
				})),
			);
	} catch (error) {
		logger.error("Failed to retrieve newsletters with recipients", {
			error,
		});
		throw new DatabaseError(
			`Failed to retrieve newsletters with recipients: ${error}`,
		);
	}
}

export async function getAllNewsletters() {
	try {
		return await db.query.newsletters.findMany({});
	} catch (error) {
		logger.error("Failed to retrieve newsletters", { error });
		throw new DatabaseError("Failed to retrieve newsletters");
	}
}

export async function getNewsletter(id: number) {
	try {
		const newsletter = await db.query.newsletters.findFirst({
			where: (newsletters, { eq }) => eq(newsletters.id, id),
			with: {
				recipients: {
					columns: {},
					with: {
						recipient: true,
					},
				},
				articles: true,
			},
		});

		if (!newsletter) {
			logger.error("Newsletter not found", { id });
			throw new DatabaseError("Newsletter not found");
		}

		// Group articles by category
		const categorizedArticles = newsletter.articles.reduce(
			(acc, article) => {
				if (!acc[article.category]) {
					acc[article.category] = [];
				}
				acc[article.category].push(article);
				return acc;
			},
			{} as Record<string, Article[]>,
		);

		// Transform to categories array
		const categories = Object.entries(categorizedArticles).map(
			([name, articles]) => ({
				name,
				articles,
			}),
		);

		return {
			...newsletter,
			recipients: newsletter.recipients.map((nr) => nr.recipient),
			categories,
		};
	} catch (error) {
		if (error instanceof DatabaseError) {
			logger.error("Failed to retrieve newsletter", { error, id });
			throw error;
		}
		logger.error("Failed to retrieve newsletter", { error, id });
		throw new DatabaseError(`Failed to retrieve newsletter: ${error}`);
	}
}

export async function createNewsletter({
	summary,
	articles: articleInputs,
}: {
	summary: string;
	articles: ArticleInputWithCategory[];
}): Promise<PopulatedNewNewsletter> {
	try {
		log("Creating newsletter");
		const allRecipients = await getAllRecipients();

		return await db.transaction(async (tx) => {
			// Create newsletter
			const [newsletter] = await tx
				.insert(newsletters)
				.values({ summary, status: "DRAFT" })
				.returning();

			const articlesArr = await tx
				.insert(articles)
				.values(
					articleInputs.map((article) => ({
						...article,
						newsletterId: newsletter.id,
					})),
				)
				.returning();

			await tx.insert(newsletterRecipients).values(
				allRecipients.map((recipient) => {
					log({
						newsletterId: newsletter.id,
						recipientId: recipient.id,
					});
					return {
						newsletterId: newsletter.id,
						recipientId: recipient.id,
					};
				}),
			);

			return { ...newsletter, articles: articlesArr };
		});
	} catch (error) {
		logger.error("Failed to create newsletter", { error });
		throw new DatabaseError(`Failed to create newsletter: ${error}`);
	}
}

export async function updateNewsletterSummary(id: number, summary: string) {
	try {
		const [updatedNewsletter] = await db
			.update(newsletters)
			.set({ summary, updatedAt: new Date() })
			.where(eq(newsletters.id, id))
			.returning();
		if (!updatedNewsletter) {
			logger.error("Newsletter not found", { id });
			throw new DatabaseError("Newsletter not found");
		}
		return updatedNewsletter;
	} catch (error) {
		if (error instanceof DatabaseError) {
			logger.error("Failed to update newsletter summary", { error, id });
			throw error;
		}
		logger.error("Failed to update newsletter summary", { error, id });
		throw new DatabaseError(`Failed to update newsletter summary: ${error}`);
	}
}

export async function deleteNewsletter(id: number) {
	try {
		return await db.transaction(async (tx) => {
			// Delete all articles associated with this newsletter
			await tx.delete(articles).where(eq(articles.newsletterId, id));

			// Delete related newsletter recipients
			await tx
				.delete(newsletterRecipients)
				.where(eq(newsletterRecipients.newsletterId, id));

			// Finally, delete the newsletter
			const [deletedNewsletter] = await tx
				.delete(newsletters)
				.where(eq(newsletters.id, id))
				.returning();

			if (!deletedNewsletter) {
				logger.error("Newsletter not found", { id });
				throw new DatabaseError("Newsletter not found");
			}

			return deletedNewsletter;
		});
	} catch (error) {
		if (error instanceof DatabaseError) {
			logger.error("Failed to delete newsletter", { error, id });
			throw error;
		}
		logger.error("Failed to delete newsletter", { error, id });
		throw new DatabaseError(`Failed to delete newsletter: ${error}`);
	}
}

// Article Functions
export async function updateArticleDescription(
	id: number,
	description: string,
) {
	try {
		const [updatedArticle] = await db
			.update(articles)
			.set({ description, updatedAt: new Date() })
			.where(eq(articles.id, id))
			.returning();
		if (!updatedArticle) {
			logger.error("Article not found", { id, description });
			throw new DatabaseError("Article not found");
		}
		return updatedArticle;
	} catch (error) {
		if (error instanceof DatabaseError) {
			logger.error("Failed to update article description", {
				error,
				id,
				description,
			});
			throw error;
		}
		logger.error("Failed to update article description", {
			error,
			id,
			description,
		});
		throw new DatabaseError(`Failed to update article description: ${error}`);
	}
}

export async function deleteArticle(id: number) {
	try {
		return await db.transaction(async (tx) => {
			const [deletedArticle] = await tx
				.delete(articles)
				.where(eq(articles.id, id))
				.returning();

			if (!deletedArticle) {
				logger.error("Article not found", { id });
				throw new DatabaseError("Article not found");
			}

			return deletedArticle;
		});
	} catch (error) {
		if (error instanceof DatabaseError) {
			logger.error("Failed to delete article", { error, id });
			throw error;
		}
		logger.error("Failed to delete article", { error, id });
		throw new DatabaseError(`Failed to delete article: ${error}`);
	}
}

// Recipient Functions
export async function getAllRecipients() {
	try {
		return await db.query.recipients.findMany();
	} catch (error) {
		logger.error("Failed to retrieve recipients", { error });
		throw new DatabaseError(`Failed to retrieve recipients: ${error}`);
	}
}

export async function addRecipient(rawEmail: string) {
	const email = decodeURIComponent(rawEmail);

	try {
		return await db.transaction(async (tx) => {
			const [recipient] = await tx
				.insert(recipients)
				.values({ email })
				.returning();

			// Get all unsent newsletters
			const unsentNewsletters = await tx
				.select({ id: newsletters.id })
				.from(newsletters)
				.where(not(eq(newsletters.status, "SENT")));

			// Add the new recipient to all unsent newsletters
			if (unsentNewsletters.length > 0) {
				await tx.insert(newsletterRecipients).values(
					unsentNewsletters.map((newsletter) => ({
						newsletterId: newsletter.id,
						recipientId: recipient.id,
					})),
				);
			}

			return recipient;
		});
	} catch (error) {
		logger.error("Failed to add recipient", { error, email, rawEmail });
		throw new DatabaseError(`Failed to add recipient: ${error}`);
	}
}

export async function deleteRecipient(rawEmail: string) {
	const email = decodeURIComponent(rawEmail);

	if (!email) {
		logger.error("Email is missing or invalid", { email, rawEmail });
		throw new Error("Email is missing or invalid");
	}

	try {
		return await db.transaction(async (tx) => {
			// find the recipient
			const [recipient] = await tx
				.select()
				.from(recipients)
				.where(eq(recipients.email, email));

			if (!recipient) {
				logger.error("Recipient not found", { email, rawEmail });
				throw new DatabaseError("Recipient not found");
			}

			// Delete all newsletter_recipients entries for this recipient
			await tx
				.delete(newsletterRecipients)
				.where(eq(newsletterRecipients.recipientId, recipient.id));

			// delete the recipient
			const [deletedRecipient] = await tx
				.delete(recipients)
				.where(eq(recipients.id, recipient.id))
				.returning();

			return deletedRecipient;
		});
	} catch (error) {
		if (error instanceof DatabaseError) {
			logger.error("Failed to delete recipient", { error, email, rawEmail });
			throw error;
		}
		logger.error("Failed to delete recipient", { error, email, rawEmail });
		throw new DatabaseError(`Failed to delete recipient: ${error}`);
	}
}
