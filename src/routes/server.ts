import { promises as fs } from "node:fs";
import path from "node:path";
import debug from "debug";
import express from "express";

const router = express.Router();
const log = debug(`${process.env.APP_NAME}:display-router`);
const basepath = path.resolve();

const loadArticles = async () => {
	try {
		const articlesJson = await fs.readFile(
			path.join(basepath, "tests", "data", "display-article-data.json"),
			"utf8",
		);
		return JSON.parse(articlesJson);
	} catch (error) {
		log("Error loading articles:", error);
		return [];
	}
};

router.get("/", async (_, res) => {
	const articles = await loadArticles();
	res.render("newsletter", { articles });
});

export default router;
