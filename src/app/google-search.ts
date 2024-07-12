import debug from "debug";
import { google } from "googleapis";

import { RECURRING_FREQUENCY } from "../lib/constants.js";
import { retry } from "../lib/utils.js";
import type { ArticleData, ValidArticleData } from "../types/index.js";

const log = debug(`${process.env.APP_NAME}:google-search.ts`);

const customsearch = google.customsearch("v1");

export function getLastDateQuery(
	q: string,
	beforeMs = RECURRING_FREQUENCY,
): string {
	try {
		const pastDate = new Date().getTime() - beforeMs;
		const formattedPastDate = new Date(pastDate).toISOString().split("T")[0];

		log(`google search query: ${q} after:${formattedPastDate}`);

		return `${q} after:${formattedPastDate}`;
	} catch (error) {
		log(`Error in getLastDateQuery: ${error}`);
		return q;
	}
}

export async function searchNews(qs: string[]): Promise<ValidArticleData[]> {
	const allResults: ArticleData[] = [];

	for (const q of qs) {
		for (let i = 0; i < 4; i++) {
			const startIndex = i * 10 + 1;

			try {
				let retryCount = 0;
				const res = await retry(() => {
					log(`Google search query retry count: ${retryCount++}`);
					return customsearch.cse.list({
						cx: process.env.CUSTOM_ENGINE_ID,
						auth: process.env.CUSTOM_SEARCH_API_KEY,
						q: getLastDateQuery(q),
						start: startIndex,
					});
				});

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
					description: undefined,
					snippet: item.snippet,
				})) as ArticleData[];

				allResults.push(...formattedResults);
			} catch (error) {
				log(`Error searching for query "${q}": ${error}`);
				// Continue with the next query even if this one fails
			}
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
