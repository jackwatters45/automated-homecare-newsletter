import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
	articles,
	categories as categoriesTable,
	newsletters,
} from "../../db/schema.js";
import { DatabaseError } from "../../lib/errors.js";
import type {
	ArticleInput,
	NewsletterInput,
	PopulatedNewCategory,
	PopulatedNewNewsletter,
} from "../../types/index.js";

export async function getAllNewsletters() {
	try {
		return await db.query.newsletters.findMany({
			with: {
				categories: {
					with: {
						articles: true,
					},
				},
			},
		});
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
			},
		});
		if (!newsletter) {
			throw new DatabaseError("Newsletter not found");
		}
		return newsletter;
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
		return await db.transaction(async (tx) => {
			const [newsletter] = await tx
				.insert(newsletters)
				.values({ summary })
				.returning();

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
