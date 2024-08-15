import debug from "debug";
import { and, desc, eq, gt, inArray, not } from "drizzle-orm/expressions";
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
	Category,
	NewArticleInput,
	NewNewsletter,
	PopulatedCategory,
	PopulatedNewsletter,
} from "../types/index.js";

import { sql } from "drizzle-orm";
import { CATEGORIES } from "../lib/constants.js";
import logger from "../lib/logger.js";
import {
	getDescription,
	groupBy,
	isValidEmail,
	validateCategory,
} from "../lib/utils.js";

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

export function sortAndPopulateCategories(
	articles: Article[],
): PopulatedCategory[] {
	const categoryOrder = new Map(
		CATEGORIES.map((category, index) => [category, index]),
	);

	// Group articles by category
	const categorizedArticles = articles.reduce(
		(acc, article) => {
			const category = validateCategory(article.category);
			if (!acc[category]) {
				acc[category] = [];
			}
			acc[category].push(article);
			return acc;
		},
		{} as Record<Category, Article[]>,
	);

	// Transform to categories array and sort
	const categories = Object.entries(categorizedArticles)
		.map(([name, articles]) => ({
			name: name as Category,
			articles,
		}))
		.sort((a, b) => {
			const orderA = categoryOrder.get(a.name) ?? Number.MAX_SAFE_INTEGER;
			const orderB = categoryOrder.get(b.name) ?? Number.MAX_SAFE_INTEGER;
			return orderA - orderB;
		});

	return categories;
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

		const categorizedArticles = sortAndPopulateCategories(newsletter.articles);

		return {
			...newsletter,
			recipients: newsletter.recipients.map((nr) => nr.recipient),
			categories: categorizedArticles,
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
}): Promise<NewNewsletter> {
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
					articleInputs.map((article, index) => ({
						...article,
						order: index,
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

export async function updateArticleOrder(
	newsletterId: string,
	articleIds: number[],
) {
	try {
		return await db.transaction(async (tx) => {
			// Fetch all articles to be updated
			const articlesToUpdate = await tx
				.select()
				.from(articles)
				.where(
					and(
						inArray(
							articles.id,
							articleIds.map((id) => id),
						),
						eq(articles.newsletterId, Number.parseInt(newsletterId)),
					),
				);

			// Group articles by category
			const articlesByCategory = groupBy<Article>(articlesToUpdate, "category");

			// Update order for each category
			for (const [category, categoryArticles] of Object.entries(
				articlesByCategory,
			)) {
				const categoryArticleIds = articleIds.filter((id) =>
					categoryArticles.some((article) => article.id === id),
				);

				for (let i = 0; i < categoryArticleIds.length; i++) {
					await tx
						.update(articles)
						.set({ order: i })
						.where(
							and(
								eq(articles.id, categoryArticleIds[i]),
								eq(articles.category, category),
								eq(articles.newsletterId, Number.parseInt(newsletterId)),
							),
						);
				}
			}

			return getNewsletter(Number.parseInt(newsletterId, 10));
		});
	} catch (error) {
		throw new DatabaseError("Failed to update article order", {
			operation: "transaction",
			tables: ["newsletters", "articles", "newsletter_recipients"],
			error: error instanceof Error ? error.message : String(error),
			newsletterId,
			articleIds,
		});
	}
}

export async function updateArticleCategory(
	newsletterId: string,
	articleId: string,
	toCategory: string,
) {
	try {
		return await db.transaction(async (tx) => {
			// Get the current article
			const [currentArticle] = await tx
				.select()
				.from(articles)
				.where(
					and(
						eq(articles.id, Number.parseInt(articleId)),
						eq(articles.newsletterId, Number.parseInt(newsletterId)),
					),
				);

			if (!currentArticle) {
				throw new DatabaseError("Article not found");
			}

			// Get the highest order in the new category
			const [highestOrderArticle] = await tx
				.select({ order: articles.order })
				.from(articles)
				.where(
					and(
						eq(articles.category, toCategory),
						eq(articles.newsletterId, Number.parseInt(newsletterId)),
					),
				)
				.orderBy(desc(articles.order))
				.limit(1);

			const newOrder = highestOrderArticle ? highestOrderArticle.order + 1 : 0;

			// Update the article
			await tx
				.update(articles)
				.set({
					category: toCategory,
					order: newOrder,
				})
				.where(eq(articles.id, Number.parseInt(articleId)));

			// Reorder articles in the old category
			await tx
				.update(articles)
				.set({
					order: sql`${articles.order} - 1`,
				})
				.where(
					and(
						eq(articles.category, currentArticle.category),
						eq(articles.newsletterId, Number.parseInt(newsletterId)),
						gt(articles.order, currentArticle.order),
					),
				);

			return getNewsletter(Number.parseInt(newsletterId, 10));
		});
	} catch (error) {
		throw new DatabaseError("Failed to update article category", {
			operation: "update",
			table: "articles",
			newsletterId,
			articleId,
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

			// Find the highest order in the category
			const [highestOrderArticle] = await tx
				.select({ order: articles.order })
				.from(articles)
				.where(eq(articles.category, articleData.category))
				.orderBy(desc(articles.order))
				.limit(1);

			const newOrder = highestOrderArticle ? highestOrderArticle.order + 1 : 0;

			// Insert the new article
			const [newArticle] = await tx
				.insert(articles)
				.values({
					...articleData,
					description,
					order: newOrder,
				})
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
		throw new DatabaseError(
			"Failed to retrieve recipients: No recipients found",
			{
				operation: "findMany",
				table: "recipients",
				error: error instanceof Error ? error.message : String(error),
			},
		);
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

export async function addBulkRecipients(emails: string[]): Promise<string[]> {
	try {
		const uniqueEmails = [...new Set(emails)];
		const validEmails = uniqueEmails.filter((email) => isValidEmail(email));

		if (validEmails.length === 0) return [];

		const result = await db.transaction(async (tx) => {
			const insertedEmails = await tx
				.insert(recipients)
				.values(validEmails.map((email) => ({ email })))
				.onConflictDoNothing()
				.returning({ email: recipients.email });

			return insertedEmails.map((row) => row.email);
		});

		return result;
	} catch (error) {
		throw new DatabaseError("Failed to add recipients", {
			operation: "insert",
			table: "recipients",
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function removeAllRecipients(): Promise<void> {
	try {
		const res = await db.delete(recipients).returning();

		logger.info("Removed all recipients", res);
	} catch (error) {
		throw new DatabaseError("Failed to remove all recipients", {
			operation: "delete",
			table: "recipients",
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
