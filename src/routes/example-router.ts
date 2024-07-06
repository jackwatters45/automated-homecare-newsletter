import path from "node:path";
import debug from "debug";
import express from "express";
import { generateNewsletterData } from "../app/index.js";
import type { ArticleDisplayData } from "../types/index.js";

const router = express.Router();
const log = debug(`${process.env.APP_NAME}:example-router`);
const basepath = path.resolve();

let data: ArticleDisplayData[] = [];

router.get("/", (req, res) => {
	log("GET /example");
	res.sendFile(path.join(basepath, "views", "generate-button.html"));
});

router.get("/generate", async (req, res) => {
	log("GET /example/generate");
	try {
		data = (await generateNewsletterData()) ?? [];
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
	try {
		res.render("newsletter", { articles: data });
	} catch (error) {
		res.status(500).send("Error rendering newsletter");
	}
});

export default router;
