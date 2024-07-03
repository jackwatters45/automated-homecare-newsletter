import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	filterAllArticles,
	filterPageArticles,
	getDataForAIFiltering,
	getOriginalArticleData,
	removeDuplicatesAndCount,
} from "../src/data/data-filtering";
import { RECURRING_FREQUENCY } from "../src/lib/constants";
import { generateJsonResponse } from "../src/lib/utils";
import type { PageToScrape } from "../types";

// Mock dependencies
vi.mock("../lib/constants", () => ({
	RECURRING_FREQUENCY: 7 * 24 * 60 * 60 * 1000, // 1 week in milliseconds
}));

vi.mock("../lib/utils", () => ({
	generateJsonResponse: vi.fn(),
}));

const page = { removeIfNoDate: false } as PageToScrape;

describe("Article Filtering and Ranking", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("filterPageArticles", () => {
		it("should filter articles based on date and required fields", async () => {
			const today = new Date();
			const weekAgo = new Date(today.getTime() - RECURRING_FREQUENCY);
			const twoWeeksAgo = new Date(today.getTime() - 2 * RECURRING_FREQUENCY);

			const articles = [
				{ link: "link1", title: "title1", date: today },
				{ link: "link2", title: "title2", date: weekAgo },
				{ link: "link3", title: "title3", date: twoWeeksAgo },
				{ link: "link4", title: "title4" },
				{ link: "link5" },
				{ title: "title6" },
			];

			const result = await filterPageArticles(articles, page);

			expect(result).toHaveLength(3);
			expect(result).toContainEqual(
				expect.objectContaining({ link: "link1", title: "title1" }),
			);
			expect(result).toContainEqual(
				expect.objectContaining({ link: "link2", title: "title2" }),
			);
			expect(result).toContainEqual(
				expect.objectContaining({ link: "link4", title: "title4" }),
			);
		});

		it("should remove articles without dates when removeIfNoDate is true", async () => {
			const today = new Date();
			const articles = [
				{ link: "link1", title: "title1", date: today },
				{ link: "link2", title: "title2" },
			];

			const result = await filterPageArticles(articles, page);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(
				expect.objectContaining({ link: "link1", title: "title1" }),
			);
		});
	});

	describe("filterAllArticles", () => {
		it("should filter and rank articles using AI", async () => {
			const articles = [
				{ link: "link1", title: "title1", date: new Date(), description: "desc1" },
				{ link: "link2", title: "title2", date: new Date(), description: "desc2" },
			];

			const aiFilteredArticles = [{ title: "title2", description: "desc2" }];

			(generateJsonResponse as any).mockResolvedValue(aiFilteredArticles);

			const result = await filterAllArticles(articles, 1);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(
				expect.objectContaining({
					link: "link2",
					title: "title2",
					description: "desc2",
					count: 1,
				}),
			);
		});
	});

	describe("getDataForAIFiltering", () => {
		it("should extract title and description for AI filtering", () => {
			const articles = [
				{ link: "link1", title: "title1", date: new Date(), description: "desc1" },
				{ link: "link2", title: "title2", date: new Date() },
			];

			const result = getDataForAIFiltering(articles);

			expect(result).toEqual([
				{ title: "title1", description: "desc1" },
				{ title: "title2", description: undefined },
			]);
		});
	});

	describe("getOriginalArticleData", () => {
		it("should retrieve original article data based on filtered titles", () => {
			const originalArticles = [
				{ link: "link1", title: "title1", date: new Date(), count: 1 },
				{ link: "link2", title: "title2", date: new Date(), count: 1 },
			];

			const filteredArticles = [{ title: "title1", description: "desc1" }];

			const result = getOriginalArticleData(originalArticles, filteredArticles);

			expect(result).toHaveLength(1);
			expect(result[0].title).toBe("title1");
		});
	});

	describe("removeDuplicatesAndCount", () => {
		it("should remove duplicates and count occurrences", () => {
			const articles = [
				{ link: "link1", title: "title1", date: new Date() },
				{ link: "link1", title: "title1", date: new Date() },
				{ link: "link2", title: "title2", date: new Date() },
			];

			const result = removeDuplicatesAndCount(articles);

			expect(result).toHaveLength(2);
			expect(result[0]).toEqual(
				expect.objectContaining({ link: "link1", title: "title1", count: 2 }),
			);
			expect(result[1]).toEqual(
				expect.objectContaining({ link: "link2", title: "title2", count: 1 }),
			);
		});

		it("should use specified fields for duplicate checking", () => {
			const articles = [
				{ link: "link1", title: "title1", date: new Date() },
				{ link: "link1", title: "title2", date: new Date() },
			];

			const result = removeDuplicatesAndCount(articles, ["link"]);

			expect(result).toHaveLength(1);
			expect(result[0].count).toBe(2);
		});
	});
});
