import express from "express";
import type { Request, Response } from "express";

import path from "node:path";
import {
	generateNewsletterData,
	sendNewsletter,
	sendNewsletterReviewEmail,
} from "../app/index.js";
import { BASE_PATH } from "../lib/constants.js";
import { DatabaseError } from "../lib/errors.js";
import { renderTemplate } from "../lib/template.js";
import {
	addRecipient,
	createNewsletter,
	deleteArticle,
	deleteNewsletter,
	deleteRecipient,
	getAllNewsletters,
	getAllRecipients,
	getNewsletter,
	updateArticleDescription,
	updateNewsletterSummary,
} from "./service.js";

const router = express.Router();

// Newsletter Controllers
export const newsletterController = {
	// Get all newsletters
	getAll: async (req: Request, res: Response) => {
		try {
			const allNewsletters = await getAllNewsletters();
			res.json(allNewsletters);
		} catch (error) {
			if (error instanceof DatabaseError) {
				res.status(500).json({ error: error.message });
			} else {
				res.status(500).json({ error: "An unexpected error occurred" });
			}
		}
	},

	// Get a specific newsletter
	getOne: async (req: Request, res: Response) => {
		const { id } = req.params;
		try {
			const newsletter = await getNewsletter(Number(id));
			res.json(newsletter);
		} catch (error) {
			if (error instanceof DatabaseError) {
				if (error.message === "Newsletter not found") {
					res.status(404).json({ error: error.message });
				} else {
					res.status(500).json({ error: error.message });
				}
			} else {
				res.status(500).json({ error: "An unexpected error occurred" });
			}
		}
	},

	// Create a new newsletter
	create: async (req: Request, res: Response) => {
		try {
			const newNewsletter = await createNewsletter(req.body);
			res.status(201).json(newNewsletter);
		} catch (error) {
			if (error instanceof DatabaseError) {
				res.status(500).json({ error: error.message });
			} else {
				res.status(500).json({ error: "An unexpected error occurred" });
			}
		}
	},

	// Update a newsletter's summary
	updateSummary: async (req: Request, res: Response) => {
		const { id } = req.params;
		const { summary } = req.body;
		try {
			const updatedNewsletter = await updateNewsletterSummary(Number(id), summary);
			res.json(updatedNewsletter);
		} catch (error) {
			if (error instanceof DatabaseError) {
				if (error.message === "Newsletter not found") {
					res.status(404).json({ error: error.message });
				} else {
					res.status(500).json({ error: error.message });
				}
			} else {
				res.status(500).json({ error: "An unexpected error occurred" });
			}
		}
	},

	// Delete a newsletter
	delete: async (req: Request, res: Response) => {
		const { id } = req.params;
		try {
			await deleteNewsletter(Number(id));
			res.json({ message: "Newsletter deleted successfully" });
		} catch (error) {
			if (error instanceof DatabaseError) {
				if (error.message === "Newsletter not found") {
					res.status(404).json({ error: error.message });
				} else {
					res.status(500).json({ error: error.message });
				}
			} else {
				res.status(500).json({ error: "An unexpected error occurred" });
			}
		}
	},
	// generate a new newsletter
	generate: async (req: Request, res: Response) => {
		try {
			const result = await generateNewsletterData();
			res.json({ result, id: result?.id });
		} catch (error) {
			res.status(500).json({ error });
		}
	},

	review: async (req: Request, res: Response) => {
		try {
			const result = await sendNewsletterReviewEmail();
			res.json({ result });
		} catch (error) {
			res.status(500).json({ error });
		}
	},

	// Send a newsletter
	send: async (req: Request, res: Response) => {
		try {
			const { id } = req.params;
			const result = await sendNewsletter(Number(id));
			res.json(result);
		} catch (error) {
			res.status(500).json({ error });
		}
	},
};

// Article Controllers
export const articleController = {
	// Update an article's description
	updateDescription: async (req: Request, res: Response) => {
		const { id } = req.params;
		const { description } = req.body;
		try {
			const updatedArticle = await updateArticleDescription(
				Number(id),
				description,
			);
			res.json(updatedArticle);
		} catch (error) {
			if (error instanceof DatabaseError) {
				if (error.message === "Article not found") {
					res.status(404).json({ error: error.message });
				} else {
					res.status(500).json({ error: error.message });
				}
			} else {
				res.status(500).json({ error: "An unexpected error occurred" });
			}
		}
	},
	delete: async (req: Request, res: Response) => {
		const { id } = req.params;
		try {
			const deletedArticle = await deleteArticle(Number(id));
			res.json({
				article: deletedArticle,
				message: "Article deleted successfully",
			});
		} catch (error) {
			if (error instanceof DatabaseError) {
				if (error.message === "Article not found") {
					res.status(404).json({ error: error.message });
				} else {
					res.status(500).json({ error: error.message });
				}
			} else {
				res.status(500).json({ error: "An unexpected error occurred" });
			}
		}
	},
};

// Recipient Controllers
export const recipientController = {
	getAll: async (req: Request, res: Response) => {
		try {
			const recipients = await getAllRecipients();
			res.json(recipients);
		} catch (error) {
			if (error instanceof DatabaseError) {
				res.status(500).json({ error: error.message });
			} else {
				res.status(500).json({ error: "An unexpected error occurred" });
			}
		}
	},
	addRecipient: async (req: Request, res: Response) => {
		const { id: email } = req.params;
		try {
			const recipient = await addRecipient(email);
			res.json(recipient);
		} catch (error) {
			if (error instanceof DatabaseError) {
				res.status(500).json({ error: error.message });
			} else {
				res.status(500).json({ error: "An unexpected error occurred" });
			}
		}
	},
	deleteRecipient: async (req: Request, res: Response) => {
		const { id: email } = req.params;
		try {
			await deleteRecipient(email);
			res.json({ message: "Recipient deleted successfully" });
		} catch (error) {
			if (error instanceof DatabaseError) {
				if (error.message === "Recipient not found") {
					res.status(404).json({ error: error.message });
				} else {
					res.status(500).json({ error: error.message });
				}
			} else {
				res.status(500).json({ error: "An unexpected error occurred" });
			}
		}
	},
};

// Pages Controllers
export const pagesController = {
	// Update an article's description
	renderGenerateButton: async (req: Request, res: Response) => {
		try {
			res.sendFile(
				path.join(BASE_PATH, "public", "views", "generate-button.html"),
			);
		} catch (error) {
			res.status(500).json({ error: "An unexpected error occurred" });
		}
	},
	// Render newsletter preview
	renderNewsletterPreview: async (req: Request, res: Response) => {
		const { id } = req.params;

		try {
			const newsletterData = await getNewsletter(Number(id));

			const template = await renderTemplate(newsletterData);

			res.send(template);
		} catch (error) {
			res.status(500).send("Error rendering newsletter");
		}
	},
};

export default router;
