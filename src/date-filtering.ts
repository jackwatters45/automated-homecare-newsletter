import type { ArticleData, PageToScrape, ValidArticleData } from "../types";
import { RECURRING_FREQUENCY } from "./constants";

function sortByDate(articles: ArticleData[]) {
	return articles.sort((a, b) => {
		if (!a.date) return 1;
		if (!b.date) return -1;
		return b.date.getTime() - a.date.getTime();
	});
}

// filter articles - still on home page
export async function filterRelevantArticles(
	articles: ArticleData[],
	page: PageToScrape,
) {
	const filteredArticles = articles.filter(
		(article): article is ValidArticleData => {
			const weekAgo = new Date().getTime() - RECURRING_FREQUENCY;
			const isValidDate = !article.date || article.date.getTime() > weekAgo;

			const hasRequiredFields = !!article.link && !!article.title;

			const meetsDateRequirement =
				!page.removeIfNoDate || (!!page.removeIfNoDate && !!article.date);

			return isValidDate && hasRequiredFields && meetsDateRequirement;
		},
	);

	return filteredArticles;
}

// async function main() {
// 	const slicedResults = responseJson.slice(0, 10);

// 	const prompt = `return the 5 most interesting articles from the following list of articles:\n\n${JSON.stringify(slicedResults)}.\n\n return the remaining articles as a JSON array in the same format as the original list.`;

// 	fs.writeFile("results.json", JSON.stringify(parsedData, null, 2));
// }
