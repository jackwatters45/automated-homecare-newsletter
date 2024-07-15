import path from "node:path";
import debug from "debug";
import express from "express";

import { generateNewsletterData } from "../app/index.js";
import { BASE_PATH, COMPANY_NAME } from "../lib/constants.js";
import { renderTemplate } from "../lib/template.js";
import { getPastWeekDate } from "../lib/utils.js";
import type { PopulatedNewNewsletter } from "../types/index.js";
import { getNewsletter } from "./api/service.js";

const log = debug(`${process.env.APP_NAME}:example-router`);

const router = express.Router();

router.get("/", (req, res) => {
	log("GET /test");
	res.sendFile(path.join(BASE_PATH, "public", "views", "generate-button.html"));
});

router.get("/generate", async (req, res) => {
	log("GET /test/generate");
	try {
		const id = (await generateNewsletterData())?.id;
		res.json({ success: true, message: "Data generated successfully", id });
	} catch (error) {
		res.status(500).json({
			success: false,
			message: `Error generating data${JSON.stringify(error)}`,
		});
	}
});

router.get("/newsletter/:id", async (req, res) => {
	const id = req.params.id;

	log(`GET /test/newsletter/${id}`);

	if (!id) {
		res.status(500).send("Error loading newsletter data");
		return;
	}

	try {
		const newsletterData = await getNewsletter(Number.parseInt(id));

		log(newsletterData);

		const template = await renderTemplate(newsletterData);

		res.send(template);
	} catch (error) {
		res.status(500).send("Error rendering newsletter");
	}
});

export default router;
