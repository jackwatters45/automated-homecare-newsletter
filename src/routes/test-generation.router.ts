import path from "node:path";
import debug from "debug";
import express from "express";
import { generateNewsletterData } from "../app/index.js";
import { BASE_PATH, COMPANY_NAME } from "../lib/constants.js";
import { getPastWeekDate } from "../lib/utils.js";
import type { NewsletterData } from "../types/index.js";

const router = express.Router();
const log = debug(`${process.env.APP_NAME}:example-router`);

let data: NewsletterData = { categories: [], summary: "" };

router.get("/", (req, res) => {
	log("GET /example");
	res.sendFile(path.join(BASE_PATH, "public", "views", "generate-button.html"));
});

router.get("/generate", async (req, res) => {
	log("GET /example/generate");
	try {
		data = (await generateNewsletterData()) ?? { categories: [], summary: "" };
		res.json({ success: true, message: "Data generated successfully" });
	} catch (error) {
		res.status(500).json({
			success: false,
			message: `Error generating data${JSON.stringify(error)}`,
		});
	}
});

router.get("/newsletter", async (req, res) => {
	log("GET /example/newsletter");

	if (!data || !data.categories || !data.summary) {
		res.status(500).send("Error loading newsletter data");
		return;
	}

	try {
		res.render("newsletter", {
			name: COMPANY_NAME,
			categories: data?.categories,
			summary: data?.summary,
			dates: getPastWeekDate(),
		});
	} catch (error) {
		res.status(500).send("Error rendering newsletter");
	}
});

export default router;
