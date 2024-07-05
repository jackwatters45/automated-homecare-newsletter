import debug from "debug";
import { google } from "googleapis";

import { RECURRING_FREQUENCY } from "../lib/constants.js";
import { retry } from "../lib/utils.js";
import type { ArticleData, ValidArticleData } from "../types/index.js";

const log = debug(`${process.env.APP_NAME}:google-search.ts`);

const customsearch = google.customsearch("v1");

export function getLastWeekQuery(q: string): string {
	try {
		const pastWeek = new Date().getTime() - RECURRING_FREQUENCY;
		const formattedPastWeek = new Date(pastWeek).toISOString().split("T")[0];

		return `${q} after:${formattedPastWeek}`;
	} catch (error) {
		log(`Error in getLastWeekQuery: ${error}`);
		// If there's an error, return the original query without the date filter
		return q;
	}
}

export async function searchNews(qs: string[]): Promise<ValidArticleData[]> {
	const allResults: ArticleData[] = [];

	for (const q of qs) {
		try {
			const res = await retry(() =>
				customsearch.cse.list({
					cx: process.env.CUSTOM_ENGINE_ID,
					auth: process.env.CUSTOM_SEARCH_API_KEY,
					q: getLastWeekQuery(q),
				}),
			);

			if (!res) {
				log(`Error searching for query "${q}": no response`);
				continue;
			}

			if (!res.data.items) {
				log(`No results found for query: ${q}`);
				continue;
			}

			const formattedResults = res.data.items.map((item) => ({
				title: item.title,
				link: item.link,
				description: item.snippet,
			})) as ArticleData[];

			allResults.push(...formattedResults);
		} catch (error) {
			log(`Error searching for query "${q}": ${error}`);
			// Continue with the next query even if this one fails
		}
	}

	const validResults = allResults.filter(
		(article): article is ValidArticleData => !!article.link && !!article.title,
	);

	log(
		`Found ${validResults.length} valid results out of ${allResults.length} total results`,
	);

	return validResults;
}

export async function safeSingleSearch(q: string): Promise<ValidArticleData[]> {
	try {
		const results = await searchNews([q]);
		return results;
	} catch (error) {
		log(`Error in safeSingleSearch for query "${q}": ${error}`);
		return [];
	}
}
