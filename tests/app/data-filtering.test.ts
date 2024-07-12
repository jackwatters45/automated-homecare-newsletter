import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterArticlesByPage } from "../../src/app/data-filtering";
import { RECURRING_FREQUENCY } from "../../src/lib/constants";
import { ArticleData, PageToScrape } from "../../src/types";

describe("filterArticlesByPage", () => {
	const mockPage = {
		url: "https://example.com",
		removeIfNoDate: false,
	} as PageToScrape;

	it("should throw an error if no articles are provided", async () => {
		await expect(filterArticlesByPage([], mockPage)).rejects.toThrow(
			"No articles found. Please check the scraping process and try again.",
		);
	});

	it("should filter out articles older than a week", async () => {
		const articles: ArticleData[] = [
			{
				title: "Old Article",
				link: "https://example.com/old",
				date: new Date(Date.now() - RECURRING_FREQUENCY - 1000),
			},
			{
				title: "New Article",
				link: "https://example.com/new",
				date: new Date(),
			},
		];

		2;

		const result = await filterArticlesByPage(articles, mockPage);
		expect(result).toHaveLength(1);
		expect(result[0].title).toBe("New Article");
	});

	it("should include articles without a date", async () => {
		const articles: ArticleData[] = [
			{ title: "No Date Article", link: "https://example.com/no-date" },
			{
				title: "With Date Article",
				link: "https://example.com/with-date",
				date: new Date(),
			},
		];

		const result = await filterArticlesByPage(articles, mockPage);
		expect(result).toHaveLength(2);
	});

	it("should filter out articles without a date when removeIfNoDate is true", async () => {
		const pageWithRemoveIfNoDate: PageToScrape = {
			...mockPage,
			removeIfNoDate: true,
		};
		const articles: ArticleData[] = [
			{ title: "No Date Article", link: "https://example.com/no-date" },
			{
				title: "With Date Article",
				link: "https://example.com/with-date",
				date: new Date(),
			},
		];

		const result = await filterArticlesByPage(articles, pageWithRemoveIfNoDate);
		expect(result).toHaveLength(1);
		expect(result[0].title).toBe("With Date Article");
	});

	it("should filter out articles without required fields", async () => {
		const articles: ArticleData[] = [
			{ title: "No Link Article" },
			{ link: "https://example.com/no-title" },
			{ title: "Valid Article", link: "https://example.com/valid" },
		];

		const result = await filterArticlesByPage(articles, mockPage);
		expect(result).toHaveLength(1);
		expect(result[0].title).toBe("Valid Article");
	});

	it("should handle errors gracefully and return an empty array", async () => {
		const mockError = new Error("Test error");
		vi.spyOn(Array.prototype, "filter").mockImplementationOnce(() => {
			throw mockError;
		});

		const articles: ArticleData[] = [
			{ title: "Test Article", link: "https://example.com/test" },
		];

		const result = await filterArticlesByPage(articles, mockPage);
		expect(result).toEqual([]);
	});

	it("should log the filtering results", async () => {
		const logMock = vi.fn();
		vi.mock("./your-logger-file", () => ({
			log: logMock,
		}));

		const articles: ArticleData[] = [
			{ title: "Valid Article", link: "https://example.com/valid" },
			{
				title: "Old Article",
				link: "https://example.com/old",
				date: new Date(Date.now() - RECURRING_FREQUENCY - 1000),
			},
		];

		await filterArticlesByPage(articles, mockPage);
		expect(logMock).toHaveBeenCalledWith(
			expect.stringContaining("Filtered 2 articles to 1"),
		);
	});
});

describe("filterArticles", () => {
	it.todo("should filter articles using AI");
});

describe("rankArticles", () => {
	it.todo("should rank articles using AI");
});

describe("filterAndRankArticles", () => {
	it.todo("should filter and rank articles using AI");
});

describe("extractArticleFilteringData", () => {
	it.todo("should extract article filtering data from articles");
});

describe("mergeFilteredArticles", () => {
	it.todo("should merge filtered articles with original articles");
});

describe("deduplicateAndCountArticles", () => {
	it.todo("should deduplicate and count articles");
});
