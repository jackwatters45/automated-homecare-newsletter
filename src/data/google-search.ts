import { google } from "googleapis";
import { RECURRING_FREQUENCY } from "../lib/constants";

const customsearch = google.customsearch("v1");

export function getLastWeekQuery(q: string) {
	const pastWeek = new Date().getTime() - RECURRING_FREQUENCY;
	const formattedPastWeek = new Date(pastWeek).toISOString().split("T")[0];

	return `${q} after:${formattedPastWeek}`;
}

export async function searchNews(q: string) {
	const res = await customsearch.cse.list({
		cx: process.env.CUSTOM_ENGINE_ID,
		auth: process.env.CUSTOM_SEARCH_API_KEY,
		q: getLastWeekQuery(q),
	});

	const formattedResults = res.data.items?.map((item) => ({
		title: item.title,
		link: item.link,
		description: item.snippet,
	}));

	return formattedResults;
}
