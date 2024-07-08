import { promises as fs } from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";

const basepath = path.resolve();

export async function renderTemplate<T>(
	data: T,
	fileName = "newsletter.hbs",
): Promise<string> {
	const source = await fs.readFile(
		path.join(basepath, "views", fileName),
		"utf-8",
	);

	const template = Handlebars.compile(source);

	return template({
		articles: data,
		date: new Date().toLocaleDateString("en-US", {
			weekday: "long",
			year: "numeric",
			month: "long",
			day: "numeric",
		}),
	});
}
