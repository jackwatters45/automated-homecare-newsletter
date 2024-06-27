import * as cheerio from "cheerio";
import Bottleneck from "bottleneck";
import robotsParser from "robots-parser";

const limiter = new Bottleneck({
	minTime: 2000, // Minimum time between requests (2 seconds)
	maxConcurrent: 1, // Ensures only one job runs at a time
});

interface ScrapedData {
	url: string;
	data: string | undefined;
	error: string | null;
}

export async function scrapeWithRetry(
	urls: string[],
	scrapeFunction: (url: string) => Promise<ScrapedData>,
	maxRetries = 3,
) {
	const results: ScrapedData[] = [];

	for (const url of urls) {
		let result: ScrapedData = { url, data: undefined, error: null };
		for (let i = 0; i < maxRetries; i++) {
			try {
				result = await limiter.schedule(() => scrapeFunction(url));
				break;
			} catch (error) {
				console.error(`Attempt ${i + 1} failed for ${url}: ${error.message}`);

				if (i === maxRetries - 1) {
					console.error(`All ${maxRetries} attempts failed for ${url}`);
					result = {
						url,
						data: undefined,
						error: `Failed after ${maxRetries} attempts`,
					};
				}
			}
		}

		results.push(result);
	}

	return results;
}

// if works for other sites -> rename to fetchArticleLinks
export async function scrapeUrlSpecificSite(url: string) {
	const isScrapeable = await canScrape(url);
	if (!isScrapeable) {
		// TODO: handle error
		return { url, data: "Scraped data", error: "can't scrape" };
	}

	const response = await fetch(url);
	const html = await response.text();
	const $ = cheerio.load(html);

	// TODO This is a placeholder. You'll need to customize this based on the website's structure
	return $('a[href*="article"]')
		.map((_, el) => $(el).attr("href"))
		.get();
}

async function canScrape(pageToScrape: string) {
	const robotsTxt = await fetch(`${pageToScrape}/robots.txt`).then((res) =>
		res.text(),
	);

	const robots = await robotsParser(pageToScrape, robotsTxt);

	return robots.isAllowed(pageToScrape);
}

export async function extractArticleContent(url: string): Promise<string> {
	const response = await fetch(url);
	const html = await response.text();
	const $ = cheerio.load(html);
  
	// TODO adjust based on tests
	return $("article").text() || $("main").text() || $("body").text();
}
