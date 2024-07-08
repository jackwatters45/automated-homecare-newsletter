import { promises as fs } from "node:fs";
import path from "node:path";
import debug from "debug";
import express from "express";
import { RECURRING_FREQUENCY } from "src/lib/constants.js";

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

function getPastWeekDate(): { start: string; end: string; year: number } {
	const pastWeek = new Date().getTime() - RECURRING_FREQUENCY;
	const formattedPastWeek = new Date(pastWeek).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	const today = new Date();
	const formattedToday = new Date(today).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	return {
		start: formattedPastWeek,
		end: formattedToday,
		year: today.getFullYear(),
	};
}

router.get("/", async (_, res) => {
	const articles = await loadArticles();
	res.render("newsletter", { articles, dates: getPastWeekDate() });
});

router.get("/old", async (_, res) => {
	const articles = await loadArticles();
	res.render("newsletter-old", { articles });
});

export default router;
