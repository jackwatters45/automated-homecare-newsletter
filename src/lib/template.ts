import { promises as fs } from "node:fs";
import path from "node:path";
import autoprefixer from "autoprefixer";
import debug from "debug";
import Handlebars from "handlebars";
import juice from "juice";
import postcss from "postcss";
import type { PopulatedNewsletter } from "../types/index.js";
import { BASE_PATH, COMPANY_NAME } from "./constants.js";
import { getPastPeriodDate } from "./utils.js";

const log = debug(`${process.env.APP_NAME}:template.ts`);

export async function renderTemplate(
	data: PopulatedNewsletter,
	fileName = "newsletter.hbs",
): Promise<string> {
	const source = await fs.readFile(
		path.join(BASE_PATH, "public", "views", fileName),
		"utf-8",
	);

	const template = Handlebars.compile(source);

	const css = await fs.readFile(
		path.join(BASE_PATH, "public", "styles", "globals.css"),
		"utf-8",
	);

	const postcssResult = await postcss([autoprefixer]).process(css, {
		from: undefined,
	});

	const dates = await getPastPeriodDate();

	const htmlContent = template({
		name: COMPANY_NAME,
		dates: {
			start: new Date(dates.start).toLocaleDateString("en-US", {
				weekday: "long",
				year: "numeric",
				month: "long",
				day: "numeric",
			}),
			end: new Date(dates.end).toLocaleDateString("en-US", {
				weekday: "long",
				year: "numeric",
				month: "long",
				day: "numeric",
			}),
			year: dates.year,
		},
		categories: data?.categories,
		summary: data?.summary,
	});

	const inlinedHtml = juice.inlineContent(htmlContent, postcssResult.css);

	return inlinedHtml;
}
