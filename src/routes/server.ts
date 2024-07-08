import { promises as fs } from "node:fs";
import path from "node:path";
import debug from "debug";
import express from "express";
import { BASE_PATH } from "../lib/constants.js";
import { getPastWeekDate } from "../lib/utils.js";
import type { ArticleDisplayData } from "../types/index.js";

const router = express.Router();
const log = debug(`${process.env.APP_NAME}:display-router`);

const loadArticles = async () => {
	try {
		const articlesJson = await fs.readFile(
			path.join(BASE_PATH, "tests", "data", "display-article-data.json"),
			"utf8",
		);
		const articlesData = JSON.parse(articlesJson) as
			| ArticleDisplayData[]
			| undefined;

		const articlesSummary = await fs.readFile(
			path.join(BASE_PATH, "tests", "data", "display-article-summary.json"),
			"utf8",
		);
		const summary = JSON.parse(articlesSummary) as string | undefined;

		return { articlesData, summary };
	} catch (error) {
		log("Error loading articles:", error);
		return undefined;
	}
};

router.get("/", async (_, res) => {
	const newsletterData = await loadArticles();

	if (
		!newsletterData ||
		!newsletterData.articlesData ||
		!newsletterData.summary
	) {
		res.status(500).send("Error loading newsletter data");
		return;
	}

	res.render("newsletter", {
		articles: newsletterData?.articlesData,
		summary: newsletterData?.summary,
		dates: getPastWeekDate(),
	});
});

export default router;
