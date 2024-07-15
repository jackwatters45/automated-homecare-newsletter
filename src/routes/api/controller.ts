import debug from "debug";
import express from "express";
import type { Request, Response } from "express";

import { generateNewsletterData } from "../../app/index.js";
import { DatabaseError } from "../../lib/errors.js";
import {
	createNewsletter,
	deleteArticle,
	deleteNewsletter,
	getAllNewsletters,
	getNewsletter,
	updateArticleDescription,
	updateNewsletterSummary,
} from "./service.js";

const log = debug("newsletter-api");

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

	generate: async (req: Request, res: Response) => {
		try {
			const result = await generateNewsletterData();
			res.json(result);
		} catch (error) {
			res.status(500).json({ error: "Failed to generate newsletter data" });
		}
	},

	send: async (req: Request, res: Response) => {
		try {
			// TODO:
			log("send newsletter");
			// const result = await ()
			// res.json(result);
		} catch (error) {
			res.status(500).json({ error: "Failed to generate newsletter" });
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

export default router;
