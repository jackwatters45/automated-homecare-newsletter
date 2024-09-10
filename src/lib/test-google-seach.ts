import "dotenv/config";

import fs from "node:fs/promises";
import debug from "debug";
import { google } from "googleapis";
import logger from "./logger.js";

const log = debug(`${process.env.APP_NAME}:google-simple-search.ts`);

const customsearch = google.customsearch("v1");

export async function simpleSearch(query: string, pages = 2) {
	try {
		const q = generateSearchTerm(query);

		const searchResults = [];
		for (let i = 0; i < pages; i++) {
			const page = await customsearch.cse.list({
				cx: process.env.CUSTOM_ENGINE_ID,
				auth: process.env.CUSTOM_SEARCH_API_KEY,
				// q,
				q: query,
				dateRestrict: "d7",
				cr: "countryUS",
				start: i * 10 + 1,
			});

			searchResults.push(...(page.data.items ?? []));
		}

		if (!searchResults?.length) {
			log(`No results found for query: ${query}`);
			return;
		}

		// log(`Results for query: ${query}`);
		// searchResults.forEach((item, index) => {
		// 	log(`${index + 1}. ${item.title}`);
		// });
		// log("\n");

		return searchResults.map((item) => item.title as string);
	} catch (error) {
		log(`Error searching for query "${query}": ${error}`);
		return [];
	}
}

const searchQueries = [
	"homecare ai",
	"homecare legislation",
	"homecare best practices",
	"homecare workforce challenges",
	"homecare telemedicine integration",
	"homecare remote monitoring tools",
	"homecare caregiver burnout strategies",
	"homecare caregiver burnout prevention",
	"homecare AI-driven decision support",
	"homecare fall prevention technology",
];

async function aggregateSearchResults(fileName: string): Promise<void> {
	const allResults: string[] = [];

	for (const query of searchQueries) {
		try {
			const results = await simpleSearch(query);
			if (!results) continue;
			allResults.push(...results);
		} catch (error) {
			logger.error(`Error performing search for "${query}": ${error}`);
		}
	}

	try {
		await fs.writeFile(fileName, JSON.stringify(allResults, null, 2));
		logger.info(`Wrote search results to file: ${fileName}`);
	} catch (error) {
		logger.error(`Error writing to file: ${error}`);
	}
}

function getCurrentMonth(): string {
	const now = new Date();
	const options = { month: "long" } as Intl.DateTimeFormatOptions;
	return new Intl.DateTimeFormat("en-US", options).format(now);
}

function generateSearchTerm(baseTerm: string): string {
	const month = getCurrentMonth();
	return `${baseTerm} ${month}`;
}

aggregateSearchResults("searchResultsNoDate.json");
