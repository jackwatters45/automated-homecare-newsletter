import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
	articles,
	categories as categoriesTable,
	newsletterRecipients,
	newsletters,
	recipients,
} from "../db/schema.js";
import { DatabaseError } from "../lib/errors.js";
import type {
	ArticleInput,
	NewsletterInput,
	PopulatedNewCategory,
	PopulatedNewNewsletter,
} from "../types/index.js";

import debug from "debug";
import {
	generateNewsletterData,
	sendNewsletterReviewEmail,
} from "../app/index.js";
import { renderTemplate } from "../lib/template.js";

const log = debug(`${process.env.APP_NAME}:routes/api/service.ts`);

export async function getAllNewsletters() {
	try {
		return await db.query.newsletters
			.findMany({
				with: {
					categories: {
						with: {
							articles: true,
						},
					},
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
		throw new DatabaseError("Failed to retrieve newsletters");
	}
}

export async function getNewsletter(id: number) {
	try {
		const newsletter = await db.query.newsletters.findFirst({
			where: eq(newsletters.id, id),
			with: {
				categories: {
					with: {
						articles: true,
					},
				},
				recipients: {
					columns: {},
					with: {
						recipient: true,
					},
				},
			},
		});

		if (!newsletter) {
			throw new DatabaseError("Newsletter not found");
		}

		return {
			...newsletter,
			recipients: newsletter.recipients.map((nr) => nr.recipient),
		};
	} catch (error) {
		if (error instanceof DatabaseError) {
			throw error;
		}
		throw new DatabaseError("Failed to retrieve newsletter");
	}
}

export async function createNewsletter({
	summary,
	categories,
}: NewsletterInput): Promise<PopulatedNewNewsletter> {
	try {
		log("Creating newsletter");
		const allRecipients = await getAllRecipients();
		log({ allRecipients });

		return await db.transaction(async (tx) => {
			// Create newsletter
			const [newsletter] = await tx
				.insert(newsletters)
				.values({ summary, status: "DRAFT" })
				.returning();

			// Create categories and articles
			const categoriesArr: PopulatedNewCategory[] = [];
			for (const categoryData of categories) {
				const [category] = await tx
					.insert(categoriesTable)
					.values({
						name: categoryData.name,
						newsletterId: newsletter.id,
					})
					.returning({
						id: categoriesTable.id,
						name: categoriesTable.name,
					});

				const articlesArr = await tx
					.insert(articles)
					.values(
						categoryData.articles.map((article: ArticleInput) => ({
							...article,
							categoryId: category.id,
						})),
					)
					.returning();

				categoriesArr.push({
					name: category.name,
					newsletterId: newsletter.id,
					articles: articlesArr,
				});
			}

			log({ allRecipients });

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

			return { ...newsletter, categories: categoriesArr };
		});
	} catch (error) {
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
			throw new DatabaseError("Newsletter not found");
		}
		return updatedNewsletter;
	} catch (error) {
		if (error instanceof DatabaseError) {
			throw error;
		}
		throw new DatabaseError("Failed to update newsletter summary");
	}
}

export async function deleteNewsletter(id: number) {
	try {
		const [deletedNewsletter] = await db
			.delete(newsletters)
			.where(eq(newsletters.id, id))
			.returning();
		if (!deletedNewsletter) {
			throw new DatabaseError("Newsletter not found");
		}
		return deletedNewsletter;
	} catch (error) {
		if (error instanceof DatabaseError) {
			throw error;
		}
		throw new DatabaseError("Failed to delete newsletter");
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
			throw new DatabaseError("Article not found");
		}
		return updatedArticle;
	} catch (error) {
		if (error instanceof DatabaseError) {
			throw error;
		}
		throw new DatabaseError("Failed to update article description");
	}
}

export async function deleteArticle(id: number) {
	try {
		const [deletedNewsletter] = await db
			.delete(articles)
			.where(eq(articles.id, id))
			.returning();
		if (!deletedNewsletter) {
			throw new DatabaseError("Newsletter not found");
		}
		return deletedNewsletter;
	} catch (error) {
		if (error instanceof DatabaseError) {
			throw error;
		}
		throw new DatabaseError("Failed to delete newsletter");
	}
}

// Recipient Functions
export async function getAllRecipients() {
	try {
		return await db.query.recipients.findMany();
	} catch (error) {
		throw new DatabaseError("Failed to retrieve recipients");
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
			return recipient;
		});
	} catch (error) {
		throw new DatabaseError(`Failed to add recipient: ${error}`);
	}
}

export async function deleteRecipient(rawEmail: string) {
	const email = decodeURIComponent(rawEmail);

	try {
		const [deletedRecipient] = await db
			.delete(recipients)
			.where(eq(recipients.email, email))
			.returning();
		if (!deletedRecipient) {
			throw new DatabaseError("Recipient not found");
		}
		return deletedRecipient;
	} catch (error) {
		if (error instanceof DatabaseError) {
			throw error;
		}
		throw new DatabaseError("Failed to delete recipient");
	}
}
