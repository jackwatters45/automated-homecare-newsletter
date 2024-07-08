import { promises as fs } from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";
import { BASE_PATH } from "../lib/constants.js";
import type { NewsletterData } from "../types/index.js";

export async function renderTemplate(
	data: NewsletterData,
	fileName = "newsletter.hbs",
): Promise<string> {
	const source = await fs.readFile(
		path.join(BASE_PATH, "views", fileName),
		"utf-8",
	);

	const template = Handlebars.compile(source);

	return template({
		articles: data?.articlesData,
		summary: data?.summary,
		date: new Date().toLocaleDateString("en-US", {
			weekday: "long",
			year: "numeric",
			month: "long",
			day: "numeric",
		}),
	});
}
