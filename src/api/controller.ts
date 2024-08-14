import express from "express";
import type { NextFunction, Request, Response } from "express";

import path from "node:path";
import { z } from "zod";
import {
	generateNewsletterData,
	sendNewsletter,
	sendNewsletterReviewEmail,
} from "../app/index.js";
import { BASE_PATH } from "../lib/constants.js";
import { DatabaseError } from "../lib/errors.js";
import { renderTemplate } from "../lib/template.js";
import { validateCategory } from "../lib/utils.js";
import {
	addArticle,
	addRecipient,
	createNewsletter,
	deleteArticle,
	deleteNewsletter,
	deleteRecipient,
	getAllNewsletters,
	getAllNewslettersWithRecipients,
	getAllRecipients,
	getNewsletter,
	getNewsletterFrequency,
	updateArticleDescription,
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

	getAllWithRecipients: async (
		req: Request,
		res: Response,
		next: NextFunction,
	) => {
		try {
			const allNewsletters = await getAllNewslettersWithRecipients();
			res.json(allNewsletters);
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
			const newNewsletter = await createNewsletter(req.body);
			res.status(201).json(newNewsletter);
		} catch (error) {
			next(error);
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
				res.status(400).json({ error: "Invalid input", details: error.errors });
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
			const result = await generateNewsletterData();
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

	// Get newsletter frequency
	getFrequency: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const weeks = await getNewsletterFrequency();
			res.json({ weeks });
		} catch (error) {
			if (
				error instanceof DatabaseError &&
				error.message === "Setting not found"
			) {
				res.status(404).json({ error: `Setting 'newsletterFrequency' not found` });
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

			res.json({ weeks: updatedWeeks });
		} catch (error) {
			if (error instanceof DatabaseError) {
				if (error.message === "Setting not found") {
					res.status(404).json({ error: `Setting 'newsletterFrequency' not found` });
				} else if (error.message.includes("Invalid setting")) {
					res.status(400).json({ error: error.message });
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
				res.status(400).json({ error: "Invalid input", details: error.errors });
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
				res.status(400).json({ error: "Invalid input", details: error.errors });
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
	// Get all recipients
	getAll: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const recipients = await getAllRecipients();
			res.json(recipients);
		} catch (error) {
			if (
				error instanceof DatabaseError &&
				error.details?.type === "EMPTY_RESULT"
			) {
				res.json([]);
			} else {
				next(error);
			}
		}
	},
	// Add a recipient
	addRecipient: async (req: Request, res: Response, next: NextFunction) => {
		const { id: email } = req.params;

		try {
			const recipient = await addRecipient(email);
			res.json(recipient);
		} catch (error) {
			if (
				error instanceof DatabaseError &&
				error.message === "Recipient already exists"
			) {
				res.status(409).json({ error: "Recipient already exists" });
			} else {
				next(error);
			}
		}
	},
	// Delete a recipient
	deleteRecipient: async (req: Request, res: Response, next: NextFunction) => {
		const { id: email } = req.params;
		try {
			await deleteRecipient(email);
			res.json({ message: "Recipient deleted successfully" });
		} catch (error) {
			if (
				error instanceof DatabaseError &&
				error.message === "Recipient not found"
			) {
				res.status(404).json({ error: "Recipient not found" });
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

		try {
			const newsletterData = await getNewsletter(Number(id));

			const template = await renderTemplate(newsletterData);

			res.send(template);
		} catch (error) {
			next(error);
		}
	},
};

export default router;
