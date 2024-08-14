import debug from "debug";
import { eq, not } from "drizzle-orm/expressions";
import { z } from "zod";

import { db } from "../db/index.js";
import {
	articles,
	newsletterRecipients,
	newsletters,
	recipients,
	settings,
} from "../db/schema.js";
import { DatabaseError } from "../lib/errors.js";
import type {
	Article,
	ArticleInputWithCategory,
	NewArticleInput,
	PopulatedNewNewsletter,
	PopulatedNewsletter,
} from "../types/index.js";

import logger from "../lib/logger.js";
import { getDescription, validateCategory } from "../lib/utils.js";

const log = debug(`${process.env.APP_NAME}:routes/api/service.ts`);

export async function getAllNewsletters() {
	try {
		return await db.query.newsletters.findMany({});
	} catch (error) {
		if (error instanceof DatabaseError) throw error;
		throw new DatabaseError("Failed to retrieve newsletters", {
			operation: "findMany",
			table: "newsletters",
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

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
		if (error instanceof DatabaseError) throw error;
		throw new DatabaseError("Failed to retrieve newsletters with recipients", {
			operation: "findMany with recipients",
			table: "newsletters",
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function getNewsletter(id: number): Promise<PopulatedNewsletter> {
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
			throw new DatabaseError("Newsletter not found", { id });
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
				name: validateCategory(name),
				articles,
			}),
		);

		return {
			...newsletter,
			recipients: newsletter.recipients.map((nr) => nr.recipient),
			categories,
		};
	} catch (error) {
		if (error instanceof DatabaseError) throw error;
		throw new DatabaseError("Failed to retrieve newsletter", {
			operation: "findFirst",
			table: "newsletters",
			id,
			error: error instanceof Error ? error.message : String(error),
		});
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
		if (error instanceof DatabaseError) throw error;
		throw new DatabaseError("Failed to create newsletter", {
			operation: "transaction",
			tables: ["newsletters", "articles", "newsletter_recipients"],
			error: error instanceof Error ? error.message : String(error),
			summary,
			articleCount: articleInputs.length,
		});
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
		if (error instanceof DatabaseError) throw error;
		throw new DatabaseError("Failed to update newsletter summary", {
			operation: "update",
			table: "newsletters",
			id,
			error: error instanceof Error ? error.message : String(error),
		});
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
				throw new DatabaseError("Newsletter not found", { id });
			}

			return deletedNewsletter;
		});
	} catch (error) {
		if (error instanceof DatabaseError) throw error;
		throw new DatabaseError("Failed to delete newsletter", {
			operation: "transaction",
			tables: ["newsletters", "articles", "newsletter_recipients"],
			id,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function getNewsletterFrequency(): Promise<number> {
	try {
		const result = await getSetting("newsletterFrequency");

		const frequency = Number.parseInt(result, 10);

		if (Number.isNaN(frequency) || frequency < 1) {
			throw new DatabaseError("Invalid newsletter frequency value in database", {
				actualValue: result,
			});
		}

		return frequency;
	} catch (error) {
		if (error instanceof DatabaseError) throw error;
		throw new DatabaseError("Failed to retrieve newsletter frequency", {
			operation: "select",
			table: "settings",
			key: "newsletterFrequency",
			error: error instanceof Error ? error.message : String(error),
		});
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
			throw new DatabaseError("Article not found", { id });
		}

		return updatedArticle;
	} catch (error) {
		if (error instanceof DatabaseError) throw error;
		throw new DatabaseError("Failed to update article description", {
			operation: "update",
			table: "articles",
			id,
			descriptionLength: description.length,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function addArticle(articleData: NewArticleInput) {
	try {
		const description = await getDescription(articleData);

		return await db.transaction(async (tx) => {
			// Check if the newsletter exists and is not sent
			const newsletter = await tx.query.newsletters.findFirst({
				where: eq(newsletters.id, articleData.newsletterId),
			});

			if (!newsletter) {
				throw new DatabaseError("Newsletter not found", {
					newsletterId: articleData.newsletterId,
				});
			}

			if (newsletter.status === "SENT") {
				throw new DatabaseError("Cannot add articles to a sent newsletter", {
					newsletterId: articleData.newsletterId,
				});
			}

			// Insert the new article
			const [newArticle] = await tx
				.insert(articles)
				.values({ ...articleData, description })
				.returning();

			return newArticle;
		});
	} catch (error) {
		if (error instanceof DatabaseError) throw error;
		throw new DatabaseError("Failed to add article", {
			operation: "insert",
			table: "articles",
			newsletterId: articleData.newsletterId,
			articleTitle: articleData.title,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function deleteArticle(id: number) {
	try {
		return await db.transaction(async (tx) => {
			// First, check if the article exists and get its newsletter ID
			const article = await tx.query.articles.findFirst({
				where: eq(articles.id, id),
				columns: { id: true, newsletterId: true },
			});

			if (!article) {
				throw new DatabaseError("Article not found", { articleId: id });
			}

			// Check if the associated newsletter is not sent
			const newsletter = await tx.query.newsletters.findFirst({
				where: eq(newsletters.id, article.newsletterId),
				columns: { status: true },
			});

			if (newsletter?.status === "SENT") {
				throw new DatabaseError("Cannot delete article from a sent newsletter", {
					articleId: id,
					newsletterId: article.newsletterId,
				});
			}

			// Delete the article
			const [deletedArticle] = await tx
				.delete(articles)
				.where(eq(articles.id, id))
				.returning();

			return deletedArticle;
		});
	} catch (error) {
		if (error instanceof DatabaseError) throw error;
		throw new DatabaseError("Failed to delete article", {
			operation: "delete",
			table: "articles",
			articleId: id,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

// Recipient Functions
export async function getAllRecipients() {
	try {
		const recipients = await db.query.recipients.findMany();

		if (recipients.length === 0) {
			throw new DatabaseError("No recipients found", {
				type: "EMPTY_RESULT",
			});
		}

		return recipients;
	} catch (error) {
		if (error instanceof DatabaseError) throw error;
		throw new DatabaseError("Failed to retrieve recipients", {
			operation: "findMany",
			table: "recipients",
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

const emailSchema = z.string().email();

export async function addRecipient(rawEmail: string) {
	let email = "";
	try {
		email = decodeURIComponent(rawEmail);
		emailSchema.parse(email); // Validate email format
	} catch (error) {
		if (error instanceof z.ZodError) {
			throw new DatabaseError("Invalid email format", { rawEmail, email });
		}
		throw new DatabaseError("Failed to decode email", { rawEmail });
	}

	try {
		return await db.transaction(async (tx) => {
			// Check if recipient already exists
			const existingRecipient = await tx.query.recipients.findFirst({
				where: eq(recipients.email, email),
			});

			if (existingRecipient) {
				throw new DatabaseError("Recipient already exists", { email });
			}

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
		if (error instanceof DatabaseError) throw error;
		throw new DatabaseError("Failed to add recipient", {
			operation: "insert",
			table: "recipients",
			email,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function deleteRecipient(rawEmail: string) {
	let email = "";
	try {
		email = decodeURIComponent(rawEmail);
		emailSchema.parse(email); // Validate email format
	} catch (error) {
		if (error instanceof z.ZodError) {
			throw new DatabaseError("Invalid email format", { rawEmail, email });
		}
		throw new DatabaseError("Failed to decode email", { rawEmail });
	}

	try {
		return await db.transaction(async (tx) => {
			// Find the recipient
			const recipient = await tx.query.recipients.findFirst({
				where: eq(recipients.email, email),
			});

			if (!recipient) {
				throw new DatabaseError("Recipient not found", { email });
			}

			// Delete all newsletter_recipients entries for this recipient
			const { rowCount: deletedAssociations } = await tx
				.delete(newsletterRecipients)
				.where(eq(newsletterRecipients.recipientId, recipient.id));

			// Delete the recipient
			const [deletedRecipient] = await tx
				.delete(recipients)
				.where(eq(recipients.id, recipient.id))
				.returning();

			return { deletedRecipient, deletedAssociations };
		});
	} catch (error) {
		if (error instanceof DatabaseError) throw error;
		throw new DatabaseError("Failed to delete recipient", {
			operation: "delete",
			table: "recipients",
			email,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

// Settings Functions
export async function getSetting(key: string) {
	if (!key || typeof key !== "string") {
		throw new DatabaseError("Invalid setting key", { key });
	}

	try {
		const result = await db
			.select({ value: settings.value })
			.from(settings)
			.where(eq(settings.key, key))
			.limit(1);

		if (result.length === 0) {
			throw new DatabaseError("Setting not found", { key });
		}

		return result[0].value;
	} catch (error) {
		if (error instanceof DatabaseError) throw error;
		throw new DatabaseError("Failed to retrieve setting", {
			operation: "select",
			table: "settings",
			key,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function updateSetting(key: string, value: string) {
	if (!key || typeof key !== "string") {
		throw new DatabaseError("Invalid setting key", { key });
	}

	if (typeof value !== "string") {
		throw new DatabaseError("Invalid setting value", { key, value });
	}

	try {
		const [updatedSetting] = await db
			.update(settings)
			.set({ value, updatedAt: new Date() })
			.where(eq(settings.key, key))
			.returning();

		if (!updatedSetting) {
			throw new DatabaseError("Setting not found", { key });
		}

		return updatedSetting.value;
	} catch (error) {
		if (error instanceof DatabaseError) throw error;
		throw new DatabaseError("Failed to update setting", {
			operation: "update",
			table: "settings",
			key,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
