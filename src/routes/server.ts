import { promises as fs } from "node:fs";
import path from "node:path";
import debug from "debug";
import express from "express";
import { BASE_PATH, COMPANY_NAME } from "../lib/constants.js";
import { getPastWeekDate } from "../lib/utils.js";
import type { Category } from "../types/index.js";

const router = express.Router();
const log = debug(`${process.env.APP_NAME}:server`);

const loadArticles = async () => {
	try {
		const categoriesJson = await fs.readFile(
			path.join(BASE_PATH, "tests", "data", "display-data-full.json"),
			"utf8",
		);
		const categoriesData = JSON.parse(categoriesJson) as Category[] | undefined;

		const articlesSummary = await fs.readFile(
			path.join(BASE_PATH, "tests", "data", "summary.json"),
			"utf8",
		);
		const summary = JSON.parse(articlesSummary) as string | undefined;

		return { categories: categoriesData, summary };
	} catch (error) {
		log("Error loading articles:", error);
		return undefined;
	}
};

router.get("/", async (_, res) => {
	const newsletterData = await loadArticles();

	if (!newsletterData || !newsletterData.categories || !newsletterData.summary) {
		res.status(500).send("Error loading newsletter data");
		return;
	}

	log(newsletterData.categories);

	res.render("newsletter", {
		name: COMPANY_NAME,
		categories: newsletterData?.categories,
		summary: newsletterData?.summary,
		dates: getPastWeekDate(),
	});
});

export default router;
