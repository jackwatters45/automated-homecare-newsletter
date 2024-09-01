import debug from "debug";
import { and, desc, eq, gt, inArray, not } from "drizzle-orm/expressions";
import { z } from "zod";

import { db } from "../db/index.js";
import {
	adNewsletterRelations,
	ads,
	articles,
	blacklistedDomains,
	newsletterRecipients,
	newsletters,
	recipients,
	reviewers,
	settings,
} from "../db/schema.js";
import { DatabaseError } from "../lib/errors.js";
import type {
	Article,
	ArticleWithQualityAndCategory,
	Category,
	NewAd,
	NewArticleInput,
	NewNewsletter,
	PopulatedCategory,
	PopulatedNewsletter,
} from "../types/index.js";

import { type ExtractTablesWithRelations, sql } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
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

export async function getAllUnsentNewsletters() {
	try {
		return await db.query.newsletters.findMany({
			where: not(eq(newsletters.status, "SENT")),
		});
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
					with: { recipient: true },
				},
				ads: {
					columns: {},
					with: { ad: true },
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
			ads: newsletter.ads.map((na) => na.ad),
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
	articles: ArticleWithQualityAndCategory[];
}): Promise<NewNewsletter & { articles: Article[] }> {
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
						articleIds && articleIds.length > 0
							? inArray(
									articles.id,
									articleIds.map((id) => id),
								)
							: sql`1 = 1`, // This condition is always true, effectively ignoring this part of the AND clause
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

interface AddArticleInput extends Omit<NewArticleInput, "description"> {
	description?: string;
}

export async function addArticle(articleData: AddArticleInput) {
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
		const queriedRecipients = await db.query.recipients.findMany({
			where: eq(recipients.status, "ACTIVE"),
		});

		if (queriedRecipients.length === 0) {
			throw new DatabaseError("No recipients found", {
				type: "EMPTY_RESULT",
			});
		}

		return queriedRecipients;
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
		emailSchema.parse(email);
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
				if (existingRecipient.status === "INACTIVE") {
					// Reactivate the recipient
					const [reactivatedRecipient] = await tx
						.update(recipients)
						.set({ status: "ACTIVE", updatedAt: new Date() })
						.where(eq(recipients.id, existingRecipient.id))
						.returning();

					// Add to unsent newsletters
					await addToUnsentNewsletters(tx, reactivatedRecipient.id);

					return reactivatedRecipient;
				}
				throw new DatabaseError("Recipient already exists and is active", {
					email,
				});
			}

			const [newRecipient] = await tx
				.insert(recipients)
				.values({ email })
				.returning();

			await addToUnsentNewsletters(tx, newRecipient.id);

			return newRecipient;
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
		emailSchema.parse(email);
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
				where: and(eq(recipients.email, email), eq(recipients.status, "ACTIVE")),
			});

			if (!recipient) {
				return { message: "Recipient deleted successfully" };
			}

			// Soft delete: update status to INACTIVE
			const [updatedRecipient] = await tx
				.update(recipients)
				.set({ status: "INACTIVE", updatedAt: new Date() })
				.where(eq(recipients.id, recipient.id))
				.returning();

			// Remove from unsent newsletters only
			const unsentNewsletters = await tx
				.select({ id: newsletters.id })
				.from(newsletters)
				.where(not(eq(newsletters.status, "SENT")));

			const { rowCount: deletedAssociations } = await tx
				.delete(newsletterRecipients)
				.where(
					and(
						eq(newsletterRecipients.recipientId, recipient.id),
						unsentNewsletters && unsentNewsletters.length > 0
							? inArray(
									newsletterRecipients.newsletterId,
									unsentNewsletters.map((n) => n.id),
								)
							: sql`1 = 0`, // This condition is always false
					),
				);

			return { updatedRecipient, deletedAssociations };
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

		return await db.transaction(async (tx) => {
			const insertedOrUpdatedRecipients = await Promise.all(
				validEmails.map(async (email) => {
					const existingRecipient = await tx.query.recipients.findFirst({
						where: eq(recipients.email, email),
					});

					if (existingRecipient && existingRecipient.status === "INACTIVE") {
						if (existingRecipient.status === "INACTIVE") {
							const [reactivated] = await tx
								.update(recipients)
								.set({ status: "ACTIVE", updatedAt: new Date() })
								.where(eq(recipients.id, existingRecipient.id))
								.returning();
							return reactivated;
						}
						return existingRecipient;
					}

					const [newRecipient] = await tx
						.insert(recipients)
						.values({ email, status: "ACTIVE" })
						.returning();
					return newRecipient;
				}),
			);

			await addToUnsentNewsletters(
				tx,
				insertedOrUpdatedRecipients.map((r) => r.id),
			);

			return insertedOrUpdatedRecipients.map((r) => r.email);
		});
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
		await db.transaction(async (tx) => {
			// Get all unsent newsletters
			const unsentNewsletters = await tx
				.select({ id: newsletters.id })
				.from(newsletters)
				.where(not(eq(newsletters.status, "SENT")));

			// Remove all recipients from unsent newsletters
			await tx.delete(newsletterRecipients).where(
				unsentNewsletters && unsentNewsletters.length > 0
					? inArray(
							newsletterRecipients.newsletterId,
							unsentNewsletters.map((n) => n.id),
						)
					: sql`1 = 0`, // This condition is always false
			);

			// Set all active recipients to inactive
			const res = await tx
				.update(recipients)
				.set({ status: "INACTIVE", updatedAt: new Date() })
				.where(eq(recipients.status, "ACTIVE"))
				.returning();

			logger.info(
				"Deactivated all recipients and removed from unsent newsletters",
				res,
			);
		});
	} catch (error) {
		throw new DatabaseError("Failed to remove all recipients", {
			operation: "delete",
			table: "recipients",
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

type TX = PgTransaction<
	NodePgQueryResultHKT,
	typeof import("../db/schema.js"),
	ExtractTablesWithRelations<typeof import("../db/schema.js")>
>;

async function addToUnsentNewsletters(tx: TX, recipientId: number | number[]) {
	const unsentNewsletters = await tx
		.select({ id: newsletters.id })
		.from(newsletters)
		.where(not(eq(newsletters.status, "SENT")));

	if (unsentNewsletters.length > 0) {
		const recipientIds = Array.isArray(recipientId) ? recipientId : [recipientId];
		await tx.insert(newsletterRecipients).values(
			unsentNewsletters.flatMap((newsletter) =>
				recipientIds.map((id) => ({
					newsletterId: newsletter.id,
					recipientId: id,
				})),
			),
		);
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

// Reviewers
export async function getAllReviewers() {
	try {
		return await db.select().from(reviewers);
	} catch (error) {
		if (error instanceof DatabaseError) throw error;
		throw new DatabaseError("Failed to retrieve reviewers", {
			operation: "select",
			table: "newsletter_reviewers",
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function getAllReviewerEmails() {
	try {
		const reviewers = await getAllReviewers();
		return reviewers.map((r) => r.email);
	} catch (error) {
		throw new DatabaseError("Failed to retrieve reviewers", {
			operation: "select",
			table: "newsletter_reviewers",
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function addReviewer(rawEmail: string) {
	let email = "";
	try {
		email = decodeURIComponent(rawEmail);
		emailSchema.parse(email);

		const existingReviewer = await await db
			.select()
			.from(reviewers)
			.where(eq(reviewers.email, email))
			.limit(1);

		if (existingReviewer.length > 0) {
			throw new DatabaseError("Reviewer already exists", { email });
		}

		const [newReviewer] = await db
			.insert(reviewers)
			.values({ email })
			.returning();

		return newReviewer;
	} catch (error) {
		if (error instanceof DatabaseError) throw error;
		if (error instanceof z.ZodError) {
			throw new DatabaseError("Invalid email format", { rawEmail, email });
		}
		throw new DatabaseError("Failed to add reviewer", {
			operation: "insert",
			table: "newsletter_reviewers",
			email,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function deleteReviewer(rawEmail: string) {
	let email = "";
	try {
		email = decodeURIComponent(rawEmail);
		emailSchema.parse(email);

		const [deletedReviewer] = await db
			.delete(reviewers)
			.where(eq(reviewers.email, email))
			.returning();

		if (!deletedReviewer) {
			throw new DatabaseError("Reviewer not found", { email });
		}

		return deletedReviewer;
	} catch (error) {
		if (error instanceof DatabaseError) throw error;
		if (error instanceof z.ZodError) {
			throw new DatabaseError("Invalid email format", { rawEmail, email });
		}
		throw new DatabaseError("Failed to delete reviewer", {
			operation: "delete",
			table: "newsletter_reviewers",
			email,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function addBulkReviewers(emails: string[]): Promise<string[]> {
	try {
		const uniqueEmails = [...new Set(emails)];
		const validEmails = uniqueEmails.filter((email) => isValidEmail(email));

		if (validEmails.length === 0) return [];

		return await db.transaction(async (tx) => {
			const insertedReviewers = await Promise.all(
				validEmails.map(async (email) => {
					const [newReviewer] = await tx
						.insert(reviewers)
						.values({ email })
						.returning();
					return newReviewer;
				}),
			);

			await addToUnsentNewsletters(
				tx,
				insertedReviewers.map((r) => r.id),
			);

			return insertedReviewers.map((r) => r.email);
		});
	} catch (error) {
		throw new DatabaseError("Failed to add recipients", {
			operation: "insert",
			table: "recipients",
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function removeAllReviewers(): Promise<void> {
	try {
		await db.delete(reviewers).returning();
	} catch (error) {
		throw new DatabaseError("Failed to remove all recipients", {
			operation: "delete",
			table: "recipients",
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

const domainSchema = z.string().url();

// Blacklisted Domains
export async function getAllBlacklistedDomains() {
	try {
		return await db.select().from(blacklistedDomains);
	} catch (error) {
		if (error instanceof DatabaseError) throw error;
		throw new DatabaseError("Failed to retrieve blacklisted domains", {
			operation: "select",
			table: "blacklisted_domains",
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function getAllBlacklistedDomainNames() {
	try {
		const domains = await getAllBlacklistedDomains();
		return domains.map((d) => d.domain);
	} catch (error) {
		throw new DatabaseError("Failed to retrieve blacklisted domains", {
			operation: "select",
			table: "blacklisted_domains",
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function addBlacklistedDomain(rawDomain: string) {
	let domain = "";
	try {
		domain = rawDomain.toLowerCase();
		// Assuming you have a domainSchema for validation

		log("parsing");
		domainSchema.parse(domain);

		log("domain", domain);
		const existingDomain = await db
			.select()
			.from(blacklistedDomains)
			.where(eq(blacklistedDomains.domain, domain))
			.limit(1);

		if (existingDomain.length > 0) {
			throw new DatabaseError("Domain already blacklisted", { domain });
		}

		const [newBlacklistedDomain] = await db
			.insert(blacklistedDomains)
			.values({ domain })
			.returning();

		return newBlacklistedDomain;
	} catch (error) {
		if (error instanceof DatabaseError) throw error;
		if (error instanceof z.ZodError) {
			throw new DatabaseError("Invalid domain format", { rawDomain, domain });
		}
		throw new DatabaseError("Failed to add blacklisted domain", {
			operation: "insert",
			table: "blacklisted_domains",
			domain,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function deleteBlacklistedDomain(rawDomain: string) {
	let domain = "";
	try {
		domain = rawDomain.toLowerCase();
		domainSchema.parse(domain);

		const [deletedDomain] = await db
			.delete(blacklistedDomains)
			.where(eq(blacklistedDomains.domain, domain))
			.returning();

		if (!deletedDomain) {
			throw new DatabaseError("Blacklisted domain not found", { domain });
		}

		return deletedDomain;
	} catch (error) {
		if (error instanceof DatabaseError) throw error;
		if (error instanceof z.ZodError) {
			throw new DatabaseError("Invalid domain format", { rawDomain, domain });
		}
		throw new DatabaseError("Failed to delete blacklisted domain", {
			operation: "delete",
			table: "blacklisted_domains",
			domain,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function addBulkBlacklistedDomains(
	domains: string[],
): Promise<string[]> {
	try {
		const uniqueDomains = [...new Set(domains.map((d) => d.toLowerCase()))];
		const validDomains = uniqueDomains.filter((domain) => {
			return domainSchema.safeParse(domain).success;
		});

		if (validDomains.length === 0) return [];

		return await db.transaction(async (tx) => {
			const insertedDomains = await Promise.all(
				validDomains.map(async (domain) => {
					const [newDomain] = await tx
						.insert(blacklistedDomains)
						.values({ domain })
						.returning();

					return newDomain;
				}),
			);

			return insertedDomains.map((d) => d.domain);
		});
	} catch (error) {
		throw new DatabaseError("Failed to add blacklisted domains", {
			operation: "insert",
			table: "blacklisted_domains",
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function removeAllBlacklistedDomains(): Promise<void> {
	try {
		await db.delete(blacklistedDomains).returning();
	} catch (error) {
		throw new DatabaseError("Failed to remove all blacklisted domains", {
			operation: "delete",
			table: "blacklisted_domains",
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

// Ads
export async function getAllAds() {
	try {
		return await db.query.ads.findMany({
			with: {
				newsletters: {
					columns: {},
					with: {
						newsletter: true,
					},
				},
			},
		});
	} catch (error) {
		throw new DatabaseError(`Failed to retrieve ads: ${error}`);
	}
}

export async function getAdById(id: number) {
	try {
		const ad = await db.query.ads.findFirst({
			where: eq(ads.id, id),
			with: {
				newsletters: {
					columns: {},
					with: {
						newsletter: true,
					},
				},
			},
		});

		if (!ad) {
			throw new DatabaseError("Ad not found");
		}

		return ad;
	} catch (error) {
		throw new DatabaseError(`Failed to retrieve ad: ${error}`);
	}
}

export async function createAd(newAd: NewAd) {
	try {
		const [createdAd] = await db.insert(ads).values(newAd).returning();
		return createdAd;
	} catch (error) {
		throw new DatabaseError(`Failed to create ad: ${error}`);
	}
}

export async function updateAd(id: number, updatedAd: Partial<NewAd>) {
	try {
		const [updated] = await db
			.update(ads)
			.set({ ...updatedAd, updatedAt: new Date() })
			.where(eq(ads.id, id))
			.returning();

		if (!updated) {
			throw new DatabaseError("Ad not found");
		}

		return updated;
	} catch (error) {
		throw new DatabaseError(`Failed to update ad: ${error}`);
	}
}

export async function deleteAd(id: number) {
	try {
		const [deleted] = await db.delete(ads).where(eq(ads.id, id)).returning();

		if (!deleted) {
			throw new DatabaseError("Ad not found");
		}

		return deleted;
	} catch (error) {
		throw new DatabaseError(`Failed to delete ad: ${error}`);
	}
}

export async function addAdToNewsletter(adId: number, newsletterId: number) {
	try {
		await db.insert(adNewsletterRelations).values({ adId, newsletterId });
	} catch (error) {
		throw new DatabaseError(`Failed to add ad to newsletter: ${error}`);
	}
}

export async function removeAdFromNewsletter(
	adId: number,
	newsletterId: number,
) {
	try {
		await db
			.delete(adNewsletterRelations)
			.where(
				and(
					eq(adNewsletterRelations.adId, adId),
					eq(adNewsletterRelations.newsletterId, newsletterId),
				),
			);
	} catch (error) {
		throw new DatabaseError(`Failed to remove ad from newsletter: ${error}`);
	}
}
