import mailchimp from "@mailchimp/mailchimp_marketing";
import debug from "debug";
import { and, desc, eq, gt, inArray, not } from "drizzle-orm/expressions";
import { z } from "zod";

import { db } from "../db/index.js";
import {
	adNewsletterRelations,
	ads,
	articles,
	blacklistedDomains,
	newsletters,
	reviewers,
	settings,
} from "../db/schema.js";
import {
	AppError,
	ConflictError,
	DatabaseError,
	NotFoundError,
	ValidationError,
} from "../lib/errors.js";
import type {
	Article,
	ArticleWithQualityAndCategory,
	Category,
	NewAd,
	NewArticleInput,
	NewNewsletter,
	PopulatedCategory,
	PopulatedNewsletter,
	Recipient,
	RecipientInput,
	RecipientStatus,
} from "../types/index.js";

import { type ExtractTablesWithRelations, sql } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import e from "express";
import { createDescriptionPrompt } from "../app/format-articles.js";
import { generateAITextResponse } from "../lib/ai.js";
import { getCache, setCache } from "../lib/cache.js";
import { CATEGORIES, LIST_MEMBERS_CACHE_KEY } from "../lib/constants.js";
import {
	type SyncRecipientsInput,
	syncRecipientsSchema,
} from "../lib/csv-processor.js";
import { MAILCHIMP_AUDIENCE_ID } from "../lib/env.js";
import logger from "../lib/logger.js";
import { sendTransactionalEmail } from "../lib/mailchimp.js";
import { renderTemplate } from "../lib/template.js";
import {
	fetchPageContent,
	getDescription,
	groupBy,
	isValidEmail,
	retry,
	validateCategory,
} from "../lib/utils.js";
import { emailSchema } from "../lib/validation.js";

const log = debug(`${process.env.APP_NAME}:routes/api/service.ts`);

export async function getAllNewsletters() {
	try {
		return await db.select().from(newsletters);
	} catch (error) {
		throw new AppError("Failed to retrieve newsletters", { cause: error });
	}
}

export async function getAllUnsentNewsletters() {
	try {
		return await db.query.newsletters.findMany({
			where: not(eq(newsletters.status, "SENT")),
		});
	} catch (error) {
		throw new AppError("Failed to retrieve unsent newsletters", {
			operation: "findMany",
			table: "newsletters",
			cause: error,
		});
	}
}

export function sortAndPopulateCategories(
	articles: Article[],
): PopulatedCategory[] {
	try {
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
	} catch (error) {
		throw new AppError("Failed to sort and populate categories", {
			cause: error,
		});
	}
}

export async function getNewsletter(id: number): Promise<PopulatedNewsletter> {
	try {
		const newsletterPromise = await db.query.newsletters.findFirst({
			where: (newsletters, { eq }) => eq(newsletters.id, id),
			with: {
				ads: {
					columns: {},
					with: { ad: true },
				},
				articles: true,
			},
		});

		const recipientsPromise = getAllRecipients();

		const [newsletter, recipients] = await Promise.all([
			newsletterPromise,
			recipientsPromise,
		]);

		if (!newsletter) {
			throw new NotFoundError("Newsletter not found", { id });
		}

		if (!recipients) {
			throw new AppError("Failed to get audience data");
		}

		const categorizedArticles = sortAndPopulateCategories(newsletter.articles);

		return {
			...newsletter,
			recipients: recipients,
			ads: newsletter.ads.map((na) => na.ad),
			categories: categorizedArticles,
		};
	} catch (error) {
		if (error instanceof NotFoundError) throw error;
		throw new AppError("Failed to retrieve newsletter", {
			id,
			cause: error,
		});
	}
}

export async function getNewsletterHTML(id: number) {
	try {
		const newsletterData = await getNewsletter(id);

		if (!newsletterData) {
			throw new NotFoundError("Newsletter data not found", { newsletterData });
		}

		const html = await renderTemplate({
			data: newsletterData,
		});

		return html;
	} catch (error) {
		if (error instanceof AppError) throw error;
		throw new AppError("Error in getNewsletterHTML", { cause: error });
	}
}

export async function addNewsletterToDB({
	summary,
	articles: articleInputs,
}: {
	summary: string;
	articles: ArticleWithQualityAndCategory[];
}): Promise<NewNewsletter & { articles: Article[] }> {
	try {
		logger.info("Creating newsletter");

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

			return { ...newsletter, articles: articlesArr };
		});
	} catch (error) {
		throw new AppError("Failed to create newsletter", {
			operation: "transaction",
			tables: ["newsletters", "articles"],
			summary,
			articleCount: articleInputs.length,
			cause: error,
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
		throw new AppError("Failed to update article order", {
			operation: "transaction",
			tables: ["newsletters", "articles"],
			newsletterId,
			articleIds,
			cause: error,
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
				throw new NotFoundError(`Article not found: ${articleId}`);
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
		if (error instanceof NotFoundError) throw error;
		throw new AppError("Failed to update article category", {
			operation: "update",
			table: "articles",
			newsletterId,
			articleId,
			cause: error,
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
			throw new NotFoundError("Newsletter not found", { id });
		}
		return updatedNewsletter;
	} catch (error) {
		if (error instanceof NotFoundError) throw error;
		throw new AppError("Failed to update newsletter summary", {
			operation: "update",
			table: "newsletters",
			id,
			cause: error,
		});
	}
}

export async function deleteNewsletter(id: number) {
	try {
		return await db.transaction(async (tx) => {
			// Delete all articles associated with this newsletter
			await tx.delete(articles).where(eq(articles.newsletterId, id));

			// Finally, delete the newsletter
			const [deletedNewsletter] = await tx
				.delete(newsletters)
				.where(eq(newsletters.id, id))
				.returning();

			if (!deletedNewsletter) {
				throw new NotFoundError("Newsletter not found", { id });
			}

			return deletedNewsletter;
		});
	} catch (error) {
		if (error instanceof NotFoundError) throw error;
		throw new AppError("Failed to delete newsletter", {
			operation: "transaction",
			tables: ["newsletters", "articles", "newsletter_recipients"],
			id,
			cause: error,
		});
	}
}

const newsletterFrequencySchema = z
	.string()
	.transform((value) => Number.parseInt(value, 10))
	.refine((value) => {
		return Number.isInteger(value) && value >= 1 && value <= 4;
	});

export async function getNewsletterFrequency(): Promise<number> {
	try {
		const frequency = await getSetting("newsletterFrequency");

		const parsedFrequency = newsletterFrequencySchema.safeParse(frequency);
		if (!parsedFrequency.success) {
			throw new AppError("Invalid newsletter frequency value in database", {
				actualValue: frequency,
			});
		}

		return parsedFrequency.data;
	} catch (error) {
		if (error instanceof ValidationError) throw error;
		throw new AppError("Failed to retrieve newsletter frequency", {
			operation: "select",
			table: "settings",
			key: "newsletterFrequency",
			cause: error,
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
			throw new NotFoundError("Article not found", { id });
		}

		return updatedArticle;
	} catch (error) {
		if (error instanceof NotFoundError) throw error;
		throw new AppError("Failed to update article description", {
			operation: "update",
			table: "articles",
			id,
			descriptionLength: description.length,
			cause: error,
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
				throw new NotFoundError("Newsletter not found", {
					newsletterId: articleData.newsletterId,
				});
			}

			if (newsletter.status === "SENT") {
				throw new ConflictError("Cannot add articles to a sent newsletter", {
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
		if (error instanceof NotFoundError) throw error;
		if (error instanceof ConflictError) throw error;
		throw new AppError("Failed to add article", {
			newsletterId: articleData.newsletterId,
			cause: error,
			articleTitle: articleData.title,
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
				throw new NotFoundError("Article not found", { articleId: id });
			}

			// Check if the associated newsletter is not sent
			const newsletter = await tx.query.newsletters.findFirst({
				where: eq(newsletters.id, article.newsletterId),
				columns: { status: true },
			});

			if (newsletter?.status === "SENT") {
				throw new ConflictError("Cannot delete article from a sent newsletter", {
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
		if (error instanceof NotFoundError) throw error;
		if (error instanceof ConflictError) throw error;
		throw new AppError("Failed to delete article", {
			operation: "delete article",
			table: "articles",
			articleId: id,
			cause: error,
		});
	}
}

// Type guards because mailchimp api is braindead
function isFetchListsSuccessful(
	response: mailchimp.lists.ListMembersInfoSuccessResponse | unknown,
): response is mailchimp.lists.ListMembersInfoSuccessResponse {
	return (
		(response as mailchimp.lists.ListMembersInfoSuccessResponse).members !==
		undefined
	);
}

function isFetchMemberSuccessful(
	response: mailchimp.lists.MembersSuccessResponse | unknown,
): response is mailchimp.lists.MembersSuccessResponse {
	return (
		(response as mailchimp.lists.MembersSuccessResponse).email_address !==
		undefined
	);
}

// Recipient Functions
export async function getAllRecipients(
	listId = MAILCHIMP_AUDIENCE_ID,
): Promise<Recipient[]> {
	const membersResponse = await mailchimp.lists.getListMembersInfo(listId);
	if (!isFetchListsSuccessful(membersResponse)) {
		throw new AppError(
			`Failed to get audience: ${JSON.stringify(membersResponse)}`,
		);
	}

	const listMembers = membersResponse.members.map((member) => ({
		id: member.id,
		status: member.status as RecipientStatus,
		contactId: member.contact_id,
		fullName: member.full_name,
		email: member.email_address,
	}));

	await setCache<Recipient[]>(LIST_MEMBERS_CACHE_KEY, listMembers);

	return listMembers;
}

export async function getRecipient(
	email: string,
	listId = MAILCHIMP_AUDIENCE_ID,
): Promise<Recipient | null> {
	try {
		const recipient = await mailchimp.lists.getListMember(listId, email);

		if (!isFetchMemberSuccessful(recipient)) {
			return null;
		}

		return {
			id: recipient.id,
			status: recipient.status as RecipientStatus,
			contactId: recipient.contact_id,
			fullName: recipient.full_name,
			email: recipient.email_address,
		};
	} catch (error) {
		if (error instanceof Error) {
			if ("status" in error && (error as { status: number }).status === 404) {
				return null;
			}
			throw new AppError(`Failed to get recipient: ${error.message}`);
		}
		throw new AppError("An unknown error occurred while getting recipient");
	}
}

export const recipientInputSchema = z.object({
	firstName: z.string(),
	lastName: z.string(),
	email: emailSchema,
});

type RecipientSource = "existing" | "admin" | "subscribed";
export async function addRecipient(
	input: z.infer<typeof recipientInputSchema>,
	source: RecipientSource,
) {
	try {
		const parsedInput = recipientInputSchema.parse(input);

		const recipient = await getRecipient(parsedInput.email);

		const subscribed = recipient?.status === "subscribed";
		if (subscribed) {
			return { result: "Member already subscribed" };
		}

		if (recipient) {
			await mailchimp.lists.setListMember(MAILCHIMP_AUDIENCE_ID, recipient.id, {
				email_address: parsedInput.email,
				status: "subscribed",
				status_if_new: "subscribed",
				merge_fields: {
					FNAME: parsedInput.firstName,
					LNAME: parsedInput.lastName,
					SUBSOURCE: source,
				},
			});

			return { result: "Member re-subscribed" };
		}

		await mailchimp.lists.addListMember(MAILCHIMP_AUDIENCE_ID, {
			email_address: parsedInput.email,
			status: "subscribed",
			merge_fields: {
				FNAME: parsedInput.firstName,
				LNAME: parsedInput.lastName,
				SUBSOURCE: "Admin",
			},
		});

		return { result: "Member created and subscribed" };
	} catch (error) {
		if (error instanceof ConflictError) throw error;
		if (error instanceof z.ZodError) {
			throw new ValidationError("Invalid input", { details: error.issues });
		}
		if (error instanceof URIError) {
			throw new AppError("Failed to decode email", { cause: error });
		}
		throw new AppError("Failed to add recipient to MailChimp audience", {
			input: input,
			source: "MailChimp audience",
			cause: error,
		});
	}
}

export async function syncRecipients(recipients: SyncRecipientsInput) {
	const uploadedRecipients = syncRecipientsSchema.parse(recipients);

	const updatedRecipients: mailchimp.lists.BatchListMembersBodyMembersObject[] =
		uploadedRecipients.map((recipient) => {
			return {
				email_address: recipient.email,
				email_type: "html",
				status: recipient.status,
				merge_fields: {
					FNAME: recipient.fullName,
					SUBSOURCE: "Epic",
				},
			};
		});

	const result = await mailchimp.lists.batchListMembers(MAILCHIMP_AUDIENCE_ID, {
		members: updatedRecipients,
		update_existing: true,
	});

	return { result: "Members updated successfully" };
}

export async function subscribeExisitingRecipient(contactId: string) {
	try {
		await mailchimp.lists.updateListMember(MAILCHIMP_AUDIENCE_ID, contactId, {
			status: "subscribed",
		});
	} catch (error) {
		throw new AppError("Failed to subscribe recipient", {
			operation: "subscribe",
			contactId,
			source: "MailChimp audience",
			cause: error,
		});
	}
}

export async function subscribeAndNotify(
	input: z.infer<typeof recipientInputSchema>,
) {
	try {
		await addRecipient(input, "subscribed");

		await sendTransactionalEmail({
			to: [input.email],
			type: "html",
			subject: "Welcome to the Homecare Newsletter by TrollyCare",
			body: `You have been added to the TrollyCare Newsletter. If you believe this is an error, <a href="*|UNSUB|*">click here</a> to unsubscribe.
      Thank you for subscribing!
      `,
		});

		logger.info(`User ${input.email} subscribed and notified successfully`);
	} catch (error) {
		logger.error(`Failed to subscribe and notify user ${input.email}:`, error);

		throw new AppError("Failed to subscribe and notify user", {
			operation: "subscribe",
			contactId: input.email,
			source: "MailChimp audience",
			cause: error,
		});
	}
}

export async function unsubscribeRecipient(contactId: string) {
	try {
		await mailchimp.lists.updateListMember(MAILCHIMP_AUDIENCE_ID, contactId, {
			status: "unsubscribed",
		});

		return { result: "Member unsubscribed" };
	} catch (error) {
		throw new AppError("Failed to unsubscribe recipient", {
			operation: "unsubscribe",
			contactId,
			source: "MailChimp audience",
			cause: error,
		});
	}
}

export async function deleteRecipient(contactId: string) {
	try {
		await mailchimp.lists.deleteListMember(MAILCHIMP_AUDIENCE_ID, contactId);
	} catch (error) {
		throw new AppError("Failed to delete recipient", {
			operation: "delete",
			contactId,
			source: "MailChimp audience",
			cause: error,
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
			throw new NotFoundError("Setting not found", { key });
		}

		return result[0].value;
	} catch (error) {
		if (error instanceof AppError) throw error;
		throw new AppError("Failed to retrieve setting", {
			operation: "select",
			table: "settings",
			key,
			cause: error,
		});
	}
}

export async function updateSetting(key: string, value: string) {
	if (!key || typeof key !== "string") {
		throw new ValidationError("Invalid setting key", { key });
	}

	if (typeof value !== "string") {
		throw new ValidationError("Invalid setting value", { key, value });
	}

	try {
		const [updatedSetting] = await db
			.update(settings)
			.set({ value, updatedAt: new Date() })
			.where(eq(settings.key, key))
			.returning();

		if (!updatedSetting) {
			throw new NotFoundError("Setting not found", { key });
		}

		return updatedSetting.value;
	} catch (error) {
		if (error instanceof NotFoundError) throw error;
		if (error instanceof ValidationError) throw error;
		throw new AppError("Failed to update setting", {
			operation: "update",
			table: "settings",
			key,
			cause: error,
		});
	}
}

// Reviewers
export async function getAllReviewers() {
	try {
		return await db.select().from(reviewers);
	} catch (error) {
		throw new AppError("Failed to retrieve reviewers", { cause: error });
	}
}

export async function getAllReviewerEmails() {
	try {
		const reviewers = await getAllReviewers();
		return reviewers.map((r) => r.email);
	} catch (error) {
		throw new AppError("Failed to retrieve reviewers emails", { cause: error });
	}
}

export async function addReviewer(rawEmail: string) {
	let email = "";
	try {
		email = decodeURIComponent(rawEmail);
		emailSchema.parse(email);

		const [existingReviewer] = await await db
			.select()
			.from(reviewers)
			.where(eq(reviewers.email, email))
			.limit(1);

		if (existingReviewer) {
			throw new ConflictError("Reviewer already exists");
		}

		const [newReviewer] = await db
			.insert(reviewers)
			.values({ email })
			.returning();

		return newReviewer;
	} catch (error) {
		if (error instanceof z.ZodError) {
			throw new ValidationError("Invalid email format", { rawEmail, email });
		}
		throw new AppError("Failed to add reviewer", { cause: error });
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
			throw new NotFoundError("Reviewer not found");
		}

		return deletedReviewer;
	} catch (error) {
		if (error instanceof z.ZodError) {
			throw new ValidationError("Invalid email format", { rawEmail, email });
		}
		if (error instanceof NotFoundError) throw error;
		throw new AppError("Failed to delete reviewer", { cause: error });
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

			return insertedReviewers.map((r) => r.email);
		});
	} catch (error) {
		throw new AppError("Failed to add bulk reviewers", { cause: error });
	}
}

export async function removeAllReviewers(): Promise<void> {
	try {
		await db.delete(reviewers).returning();
	} catch (error) {
		throw new AppError("Failed to remove all reviewers", { cause: error });
	}
}

const domainSchema = z.string().url();

// Blacklisted Domains
export async function getAllBlacklistedDomains() {
	try {
		return await db.select().from(blacklistedDomains);
	} catch (error) {
		throw new AppError("Failed to retrieve blacklisted domains", {
			cause: error,
		});
	}
}

export async function getAllBlacklistedDomainNames() {
	try {
		const domains = await getAllBlacklistedDomains();
		return domains.map((d) => d.domain);
	} catch (error) {
		throw new AppError("Failed to retrieve blacklisted domains", {
			cause: error,
		});
	}
}

export async function getAllExternalBlacklistedDomainNames() {
	try {
		const domains = await db
			.select()
			.from(blacklistedDomains)
			.where(eq(blacklistedDomains.type, "EXTERNAL"));

		return domains.map((d) => d.domain);
	} catch (error) {
		throw new AppError("Failed to retrieve external blacklisted domains", {
			cause: error,
		});
	}
}

export async function addBlacklistedDomain(rawDomain: string) {
	let domain = "";
	try {
		domain = rawDomain.toLowerCase();
		domainSchema.parse(domain);

		const [existingDomain] = await db
			.select()
			.from(blacklistedDomains)
			.where(eq(blacklistedDomains.domain, domain))
			.limit(1);

		if (existingDomain) {
			throw new ConflictError(`Domain already blacklisted: ${domain}`);
		}

		const [newBlacklistedDomain] = await db
			.insert(blacklistedDomains)
			.values({ domain })
			.returning();

		return newBlacklistedDomain;
	} catch (error) {
		if (error instanceof z.ZodError) {
			throw new ValidationError("Invalid domain format", { rawDomain, domain });
		}
		if (error instanceof ConflictError) {
			throw error;
		}
		throw new AppError("Failed to add blacklisted domain", { cause: error });
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
			throw new NotFoundError("Domain not found in blacklist");
		}

		return deletedDomain;
	} catch (error) {
		if (error instanceof z.ZodError) {
			throw new ValidationError("Invalid domain format", { rawDomain, domain });
		}
		if (error instanceof NotFoundError) {
			throw error;
		}
		throw new AppError("Failed to delete blacklisted domain", { cause: error });
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
		throw new AppError("Failed to add bulk blacklisted domains", {
			cause: error,
		});
	}
}

export async function removeAllBlacklistedDomains() {
	try {
		return await db.delete(blacklistedDomains).returning();
	} catch (error) {
		throw new AppError("Failed to remove all blacklisted domains", {
			cause: error,
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
		throw new AppError("Failed to retrieve ads", { cause: error });
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
			throw new NotFoundError(`Ad not found${id}`);
		}

		return ad;
	} catch (error) {
		if (error instanceof NotFoundError) throw error;
		throw new AppError("Failed to retrieve ad", { cause: error });
	}
}

export async function createAd(newAd: NewAd) {
	try {
		const [createdAd] = await db.insert(ads).values(newAd).returning();
		return createdAd;
	} catch (error) {
		throw new AppError("Failed to create ad", { cause: error });
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
			throw new NotFoundError(`Ad not found${id}`);
		}

		return updated;
	} catch (error) {
		if (error instanceof NotFoundError) throw error;
		throw new AppError("Failed to update ad", { cause: error });
	}
}

export async function deleteAd(id: number) {
	try {
		const [deleted] = await db.delete(ads).where(eq(ads.id, id)).returning();

		if (!deleted) {
			throw new NotFoundError(`Ad not found${id}`);
		}

		return deleted;
	} catch (error) {
		if (error instanceof NotFoundError) throw error;
		throw new AppError("Failed to delete ad", { cause: error });
	}
}

export async function addAdToNewsletter(adId: number, newsletterId: number) {
	try {
		await db.insert(adNewsletterRelations).values({ adId, newsletterId });
	} catch (error) {
		throw new AppError("Failed to add ad to newsletter", { cause: error });
	}
}

export async function removeAdFromNewsletter(
	adId: number,
	newsletterId: number,
) {
	try {
		const [result] = await db
			.delete(adNewsletterRelations)
			.where(
				and(
					eq(adNewsletterRelations.adId, adId),
					eq(adNewsletterRelations.newsletterId, newsletterId),
				),
			)
			.returning({ adId: adNewsletterRelations.adId });

		if (!result) {
			throw new NotFoundError(`Ad not found in newsletter${adId}`);
		}

		return result;
	} catch (error) {
		throw new AppError("Failed to remove ad from newsletter", { cause: error });
	}
}
