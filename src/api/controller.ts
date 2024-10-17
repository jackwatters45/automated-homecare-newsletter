import express from "express";
import type { NextFunction, Request, Response } from "express";

import path from "node:path";
import { z } from "zod";
import {
	createNewsletter,
	sendNewsletter,
	sendNewsletterReviewEmail,
	sendNewsletterReviewEmailById,
} from "../app/index.js";
import { BASE_PATH, BASE_UPLOAD_DIR } from "../lib/constants.js";
import { updateNewsletterFrequency } from "../lib/cron.js";
import {
	AppError,
	ConflictError,
	NotFoundError,
	ValidationError,
} from "../lib/errors.js";
import logger from "../lib/logger.js";
import { handleFileChunk, processCompleteFile } from "../lib/recipient-sync.js";
import { renderTemplate } from "../lib/template.js";
import { validateCategory } from "../lib/utils.js";
import { FileInputSchema, sanitizeFilePath } from "../lib/validation.js";
import {
	addAdToNewsletter,
	addArticle,
	addBlacklistedDomain,
	addBulkBlacklistedDomains,
	addBulkReviewers,
	addNewsletterToDB,
	addRecipient,
	addReviewer,
	createAd,
	deleteAd,
	deleteArticle,
	deleteBlacklistedDomain,
	deleteNewsletter,
	deleteRecipient,
	deleteReviewer,
	getAdById,
	getAllAds,
	getAllBlacklistedDomainNames,
	getAllExternalBlacklistedDomainNames,
	getAllNewsletters,
	getAllRecipients,
	getAllReviewers,
	getAllUnsentNewsletters,
	getNewsletter,
	getNewsletterFrequency,
	getNewsletterHTML,
	getRecipient,
	recipientInputSchema,
	removeAdFromNewsletter,
	removeAllBlacklistedDomains,
	removeAllReviewers,
	subscribeAndNotify,
	subscribeExisitingRecipient,
	unsubscribeRecipient,
	updateAd,
	updateArticleCategory,
	updateArticleDescription,
	updateArticleOrder,
	updateArticleTitle,
	updateNewsletterSummary,
	updateSetting,
} from "./service.js";

const router = express.Router();

const updateSummarySchema = z.object({
	summary: z.string().min(1).max(500), // adjust max length as needed
});

const updateFrequencySchema = z.object({
	weeks: z.number().int().min(1).max(4),
});

const updateArticleOrderSchema = z.object({
	articleIds: z.array(z.number()).min(1),
});

const updateArticleCategorySchema = z.object({
	toCategoryId: z.string(),
});

const idSchema = z.string();

// Newsletter Controllers
export const newsletterController = {
	// Get all newsletters
	getAll: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const allNewsletters = await getAllNewsletters();
			res.json(allNewsletters);
		} catch (error) {
			next(error);
		}
	},

	// Get all unsent newsletters
	getAllUnsent: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const allUnsentNewsletters = await getAllUnsentNewsletters();
			res.json(allUnsentNewsletters);
		} catch (error) {
			next(error);
		}
	},

	// Get a specific newsletter
	getOne: async (req: Request, res: Response, next: NextFunction) => {
		const { id } = req.params;
		try {
			const newsletter = await getNewsletter(Number(id));
			res.json(newsletter);
		} catch (error) {
			next(error);
		}
	},

	// Create a new newsletter
	create: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const newNewsletter = await addNewsletterToDB(req.body);
			res.status(201).json(newNewsletter);
		} catch (error) {
			next(error);
		}
	},

	// Update a newsletter's article order
	async updateArticleOrder(req: Request, res: Response, next: NextFunction) {
		try {
			const { articleIds } = updateArticleOrderSchema.parse(req.body);
			const updatedNewsletter = await updateArticleOrder(
				req.params.id,
				articleIds,
			);
			res.json(updatedNewsletter);
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else {
				next(error);
			}
		}
	},

	// Update a newsletter's article category
	async updateArticleCategory(req: Request, res: Response, next: NextFunction) {
		try {
			const { toCategoryId } = updateArticleCategorySchema.parse(req.body);
			const updatedNewsletter = await updateArticleCategory(
				req.params.id,
				req.params.articleId,
				toCategoryId,
			);
			res.json(updatedNewsletter);
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else {
				next(error);
			}
		}
	},

	// Update a newsletter's summary
	updateSummary: async (req: Request, res: Response, next: NextFunction) => {
		const { id } = req.params;
		try {
			const { summary } = updateSummarySchema.parse(req.body);
			const updatedNewsletter = await updateNewsletterSummary(Number(id), summary);
			res.json(updatedNewsletter);
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else {
				next(error);
			}
		}
	},

	// Delete a newsletter
	delete: async (req: Request, res: Response, next: NextFunction) => {
		const { id } = req.params;
		try {
			await deleteNewsletter(Number(id));
			res.json({ message: "Newsletter deleted successfully" });
		} catch (error) {
			next(error);
		}
	},

	// generate a new newsletter
	generate: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const result = await createNewsletter();
			res.json({ result, id: result?.id });
		} catch (error) {
			next(error);
		}
	},

	review: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const result = await sendNewsletterReviewEmail();
			res.json({ result });
		} catch (error) {
			next(error);
		}
	},

	reviewById: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const result = await sendNewsletterReviewEmailById(Number(req.params.id));
			res.json({ result });
		} catch (error) {
			next(error);
		}
	},

	// Send a newsletter
	send: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const { id } = req.params;
			const result = await sendNewsletter(Number(id));
			res.json(result);
		} catch (error) {
			next(error);
		}
	},

	// Get newsletter HTML
	getHTML: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const { id } = req.params;
			const html = await getNewsletterHTML(Number(id));
			res.json(html);
		} catch (error) {
			next(error);
		}
	},

	// Get newsletter frequency
	getFrequency: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const weeks = await getNewsletterFrequency();
			res.json({ weeks });
		} catch (error) {
			if (error instanceof AppError && error.message === "Setting not found") {
				next(new NotFoundError("Setting 'newsletterFrequency' not found"));
			} else {
				next(error);
			}
		}
	},

	// Update newsletter frequency
	updateFrequency: async (req: Request, res: Response, next: NextFunction) => {
		const { weeks } = updateFrequencySchema.parse(req.body);

		try {
			const updatedWeeks = await updateSetting(
				"newsletterFrequency",
				weeks.toString(),
			);

			await updateNewsletterFrequency(Number.parseInt(updatedWeeks, 10));

			res.json({ weeks: updatedWeeks });
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else if (error instanceof AppError) {
				if (error.message === "Setting not found") {
					next(new NotFoundError("Setting 'newsletterFrequency' not found"));
				} else if (error.message.includes("Invalid setting")) {
					next(new ValidationError(error.message));
				} else {
					next(error);
				}
			} else {
				next(error);
			}
		}
	},
};

const articleSchema = z.object({
	newsletterId: z.coerce.number(),
	title: z.string().min(5).max(100),
	link: z.string().url(),
	category: z.string(),
	description: z
		.union([z.string().min(50).max(250), z.string().max(0)])
		.optional(),
});

const updateDescriptionSchema = z.object({
	description: z.string().min(1).max(1000),
});

const emailSchema = z
	.string()
	.trim()
	.email("Invalid email address")
	.transform((email) => {
		return email.toLowerCase();
	});

const bulkEmailsSchema = z.array(emailSchema);

// Article Controllers
export const articleController = {
	// Update an article's description
	updateDescription: async (req: Request, res: Response, next: NextFunction) => {
		const { id } = req.params;
		try {
			const { description } = updateDescriptionSchema.parse(req.body);
			const updatedArticle = await updateArticleDescription(
				Number(id),
				description,
			);
			res.json(updatedArticle);
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else {
				next(error);
			}
		}
	},
	// Create an article
	create: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const validatedData = articleSchema.parse(req.body);
			const newArticle = await addArticle({
				...validatedData,
				category: validateCategory(validatedData.category),
			});
			res.status(201).json(newArticle);
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else {
				next(error);
			}
		}
	},
	// Delete an article
	delete: async (req: Request, res: Response, next: NextFunction) => {
		const { id } = req.params;
		try {
			const deletedArticle = await deleteArticle(Number(id));
			res.json({
				article: deletedArticle,
				message: "Article deleted successfully",
			});
		} catch (error) {
			next(error);
		}
	},
};

// Recipient Controllers
export const recipientController = {
	// Get audience from mailchimp
	getAllRecipients: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const recipients = await getAllRecipients();
			res.json(recipients);
		} catch (error) {
			next(error);
		}
	},
	// Add a recipient
	addRecipient: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const parsedInput = recipientInputSchema.parse(req.body);
			const subscription = await addRecipient(parsedInput, "admin");
			res.json(subscription);
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else if (
				error instanceof AppError &&
				error.message === "Recipient already exists"
			) {
				next(new ConflictError("Recipient already exists"));
			} else {
				next(error);
			}
		}
	},
	// Sync recipients
	syncRecipients: async (req: Request, res: Response, next: NextFunction) => {
		if (!req.file) {
			logger.error("No file uploaded");
			return res.status(400).json({ error: "No file uploaded" });
		}

		const { originalFilename, chunkIndex, totalChunks } = FileInputSchema.parse({
			originalFilename: req.file.originalname,
			chunkIndex: Number.parseInt(req.body.chunkIndex),
			totalChunks: Number.parseInt(req.body.totalChunks),
		});

		if (!originalFilename) {
			logger.error("Filename is missing");
			return res.status(400).json({ error: "Filename is missing" });
		}

		const sanitizedFilename = sanitizeFilePath(originalFilename);

		try {
			// Always handle the chunk first
			await handleFileChunk(req.file.path, chunkIndex, sanitizedFilename);
			logger.info(`Chunk ${chunkIndex} handled successfully`);

			if (chunkIndex === totalChunks - 1) {
				logger.info("Processing complete file");
				const result = await processCompleteFile(sanitizedFilename, totalChunks);
				logger.info("File processing complete, sending response");
				res.json(result);
			} else {
				res.json({ message: "Chunk received" });
			}
		} catch (error) {
			logger.error("Error in syncRecipients:", error);
			next(error);
		}
	},

	// Subscribe existing recipient
	subscribeExisitingRecipient: async (
		req: Request,
		res: Response,
		next: NextFunction,
	) => {
		const { id: contactId } = req.params;

		if (!contactId) {
			next(new ValidationError("Invalid input: contactId is required"));
		}

		try {
			await subscribeExisitingRecipient(contactId);
			res.json({ message: "Recipient subscribed successfully" });
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.issues }));
			} else if (
				error instanceof AppError &&
				error.message === "Recipient not found"
			) {
				next(new NotFoundError("Recipient not found"));
			} else {
				next(error);
			}
		}
	},
	// Unsubscribe a recipient
	unsubscribeRecipient: async (
		req: Request,
		res: Response,
		next: NextFunction,
	) => {
		const { id: contactId } = req.params;

		if (!contactId) {
			next(new ValidationError("Invalid input: contactId is required"));
		}

		try {
			await unsubscribeRecipient(contactId);
			res.json({ message: "Recipient unsubscribed successfully" });
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.issues }));
			} else if (
				error instanceof AppError &&
				error.message === "Recipient not found"
			) {
				next(new NotFoundError("Recipient not found"));
			} else {
				next(error);
			}
		}
	},
	// Delete a recipient
	deleteRecipient: async (req: Request, res: Response, next: NextFunction) => {
		const { id: contactId } = req.params;

		if (!contactId) {
			next(new ValidationError("Invalid input: contactId is required"));
		}

		try {
			await deleteRecipient(contactId);
			res.json({ message: "Recipient deleted successfully" });
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else if (
				error instanceof AppError &&
				error.message === "Recipient not found"
			) {
				next(new NotFoundError("Recipient not found"));
			} else {
				next(error);
			}
		}
	},
};

// Subscription Controllers
export const subscriptionController = {
	// add a subscription
	addSubscription: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const parsedInput = recipientInputSchema.parse(req.body);
			const subscription = await subscribeAndNotify(parsedInput);
			res.json(subscription);
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else {
				next(error);
			}
		}
	},

	// remove a subscription
	removeSubscription: async (
		req: Request,
		res: Response,
		next: NextFunction,
	) => {
		try {
			const { id: email } = req.params;

			const parsedEmail = emailSchema.safeParse(email);
			if (!parsedEmail.success) {
				next(new ValidationError("Invalid email format"));
			}

			const result = await unsubscribeRecipient(email);
			res.json(result);
		} catch (error) {
			if (error instanceof AppError && error.message === "Subscriber not found") {
				next(new NotFoundError("Subscriber not found"));
			} else {
				next(error);
			}
		}
	},
};

// Pages Controllers
export const pagesController = {
	// Update an article's description
	renderGenerateButton: async (
		req: Request,
		res: Response,
		next: NextFunction,
	) => {
		try {
			res.sendFile(
				path.join(BASE_PATH, "public", "views", "generate-button.html"),
			);
		} catch (error) {
			next(error);
		}
	},
	// Render newsletter preview
	renderNewsletterPreview: async (
		req: Request,
		res: Response,
		next: NextFunction,
	) => {
		const { id } = req.params;

		const parsedId = idSchema.safeParse(id);
		if (!parsedId.success) {
			next(new ValidationError("Invalid input: id is required"));
		}

		try {
			const newsletterData = await getNewsletter(Number(id));

			const template = await renderTemplate({ data: newsletterData });

			res.send(template);
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else {
				next(error);
			}
		}
	},
};

export const reviewerController = {
	// Get all reviewers
	getAll: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const reviewers = await getAllReviewers();
			res.json(reviewers);
		} catch (error) {
			next(error);
		}
	},
	// Add a reviewer
	addReviewer: async (req: Request, res: Response, next: NextFunction) => {
		const { id: email } = req.params;

		const parsedEmail = emailSchema.safeParse(email);
		if (!parsedEmail.success) {
			next(new ValidationError("Invalid email format"));
		}

		try {
			const reviewer = await addReviewer(email);
			res.json(reviewer);
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else if (
				error instanceof AppError &&
				error.message === "Reviewer already exists"
			) {
				next(new ConflictError("Reviewer already exists"));
			} else {
				next(error);
			}
		}
	},
	// Delete a reviewer
	deleteReviewer: async (req: Request, res: Response, next: NextFunction) => {
		const { id: email } = req.params;

		const parsedEmail = emailSchema.safeParse(email);
		if (!parsedEmail.success) {
			next(new ValidationError("Invalid email format"));
		}

		try {
			await deleteReviewer(email);
			res.json({ message: "Reviewer deleted successfully" });
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else if (
				error instanceof AppError &&
				error.message === "Reviewer not found"
			) {
				next(new NotFoundError("Reviewer not found"));
			} else {
				next(error);
			}
		}
	},
	// Add bulk reviewers
	addBulk: async (req: Request, res: Response, next: NextFunction) => {
		const { emails } = req.body;

		const parsedEmails = bulkEmailsSchema.safeParse(emails);
		if (!parsedEmails.success) {
			next(new ValidationError("Invalid input: emails should be an array"));
		}

		try {
			const addedEmails = await addBulkReviewers(emails);
			res.status(200).json(addedEmails);
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else {
				next(error);
			}
		}
	},
	// Remove all reviewers
	removeAll: async (req: Request, res: Response, next: NextFunction) => {
		try {
			await removeAllReviewers();
			res.status(200).json({ message: "All recipients removed successfully" });
		} catch (error) {
			next(error);
		}
	},
};

const domainSchema = z.string().url();

const bulkDomainsSchema = z.array(domainSchema);

export const blacklistedDomainController = {
	// Get all blacklisted domains
	getAll: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const domains = await getAllBlacklistedDomainNames();
			res.json(domains);
		} catch (error) {
			next(error);
		}
	},

	//	Get all external blacklisted domains
	getAllExternal: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const domains = await getAllExternalBlacklistedDomainNames();
			res.json(domains);
		} catch (error) {
			next(error);
		}
	},

	// Add a blacklisted domain
	addDomain: async (req: Request, res: Response, next: NextFunction) => {
		const { domain } = req.body;

		const parsedDomain = domainSchema.safeParse(domain);
		if (!parsedDomain.success) {
			next(new ValidationError("Invalid domain format"));
		}

		try {
			const addedDomain = await addBlacklistedDomain(domain);
			res.json(addedDomain);
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else if (
				error instanceof AppError &&
				error.message === "Domain already blacklisted"
			) {
				next(new ConflictError("Domain already blacklisted"));
			} else {
				next(error);
			}
		}
	},

	// Delete a blacklisted domain
	deleteDomain: async (req: Request, res: Response, next: NextFunction) => {
		const { id: domain } = req.params;

		const parsedDomain = domainSchema.safeParse(domain);
		if (!parsedDomain.success) {
			next(new ValidationError("Invalid domain format"));
		}

		try {
			await deleteBlacklistedDomain(domain);
			res.json({ message: "Domain removed from blacklist successfully" });
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else if (
				error instanceof AppError &&
				error.message === "Domain not found in blacklist"
			) {
				next(new NotFoundError("Domain not found in blacklist"));
			} else {
				next(error);
			}
		}
	},

	// Add bulk blacklisted domains
	addBulk: async (req: Request, res: Response, next: NextFunction) => {
		const { domains } = req.body;

		const parsedDomains = bulkDomainsSchema.safeParse(domains);
		if (!parsedDomains.success) {
			next(new ValidationError("Invalid input: domains should be an array"));
		}

		try {
			const addedDomains = await addBulkBlacklistedDomains(domains);
			res.status(200).json(addedDomains);
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else {
				next(error);
			}
		}
	},

	// Remove all blacklisted domains
	removeAll: async (req: Request, res: Response, next: NextFunction) => {
		try {
			await removeAllBlacklistedDomains();
			res
				.status(200)
				.json({ message: "All blacklisted domains removed successfully" });
		} catch (error) {
			next(error);
		}
	},
};

export const adController = {
	getAllAds: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const ads = await getAllAds();
			res.json(ads);
		} catch (error) {
			if (error instanceof AppError) {
				next(new NotFoundError("Ad not found"));
			} else {
				next(error);
			}
		}
	},

	getAdById: async (req: Request, res: Response, next: NextFunction) => {
		const { id } = req.params;

		const parsedId = idSchema.safeParse(id);
		if (!parsedId.success) {
			next(new ValidationError("Invalid input: id is required"));
		}

		try {
			const ad = await getAdById(Number(id));
			res.json(ad);
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else if (error instanceof AppError && error.message === "Ad not found") {
				next(new NotFoundError(error.message));
			} else {
				next(error);
			}
		}
	},

	// TODO: once ad schema include here
	createAd: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const newAd = await createAd(req.body);
			res.status(201).json(newAd);
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			}
		}
	},

	updateAd: async (req: Request, res: Response, next: NextFunction) => {
		const { id } = req.params;

		const parsedId = idSchema.safeParse(id);
		if (!parsedId.success) {
			next(new ValidationError("Invalid input: id is required"));
		}

		try {
			const updatedAd = await updateAd(Number(id), req.body);
			res.json(updatedAd);
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else if (error instanceof AppError && error.message === "Ad not found") {
				next(new NotFoundError(error.message));
			} else {
				next(error);
			}
		}
	},

	deleteAd: async (req: Request, res: Response, next: NextFunction) => {
		const { id } = req.params;

		const parsedId = idSchema.safeParse(id);
		if (!parsedId.success) {
			next(new ValidationError("Invalid input: id is required"));
		}

		try {
			await deleteAd(Number(id));
			res.json({ message: "Ad deleted successfully" });
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else if (error instanceof AppError && error.message === "Ad not found") {
				next(new NotFoundError(error.message));
			} else {
				next(error);
			}
		}
	},

	addAdToNewsletter: async (req: Request, res: Response, next: NextFunction) => {
		const { adId, newsletterId } = req.params;

		const parsedAdId = idSchema.safeParse(adId);
		const parsedNewsletterId = idSchema.safeParse(newsletterId);

		if (!parsedAdId.success || !parsedNewsletterId.success) {
			next(
				new ValidationError("Invalid input: adId and newsletterId are required"),
			);
		}

		try {
			await addAdToNewsletter(Number(adId), Number(newsletterId));
			res.json({ message: "Ad added to newsletter successfully" });
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else if (error instanceof AppError && error.message === "Ad not found") {
				next(new NotFoundError(error.message));
			} else {
				next(error);
			}
		}
	},

	removeAdFromNewsletter: async (
		req: Request,
		res: Response,
		next: NextFunction,
	) => {
		const { adId, newsletterId } = req.params;

		const parsedAdId = idSchema.safeParse(adId);
		const parsedNewsletterId = idSchema.safeParse(newsletterId);

		if (!parsedAdId.success || !parsedNewsletterId.success) {
			next(
				new ValidationError("Invalid input: adId and newsletterId are required"),
			);
		}

		try {
			await removeAdFromNewsletter(Number(adId), Number(newsletterId));
			res.json({ message: "Ad removed from newsletter successfully" });
		} catch (error) {
			if (error instanceof z.ZodError) {
				next(new ValidationError("Invalid input", { details: error.errors }));
			} else if (error instanceof AppError && error.message === "Ad not found") {
				next(new NotFoundError(error.message));
			} else {
				next(error);
			}
		}
	},
};

export default router;
