import * as cheerio from "cheerio";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchArticles } from "../src/data/data-fetching";
import type { PageToScrape } from "../types";

// Mock external dependencies
vi.mock("cheerio");
vi.mock("robots-parser");
vi.mock("debug", () => ({ default: vi.fn() }));

// Mock the fetch function
global.fetch = vi.fn();

const mockPage = {
	url: "https://example.com",
	articleContainerSelector: ".article",
	linkSelector: "a",
	titleSelector: "h2",
	descriptionSelector: "p",
	dateSelector: ".date",
	type: "server",
} as PageToScrape;

describe("data-fetching", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("fetchArticles", () => {
		it("should return an array of article data when scraping is allowed", async () => {
			const mockBrowserPage = {
				goto: vi.fn(),
				content: vi.fn(),
			};

			// Mock canScrape to return true
			vi.spyOn(global, "fetch").mockResolvedValueOnce({
				ok: true,
				text: vi.fn().mockResolvedValue("User-agent: *\nAllow: /"),
			} as any);

			// Mock cheerio to return some sample data
			(cheerio.load as any).mockReturnValue({
				find: vi.fn().mockReturnValue([
					{
						find: vi.fn().mockReturnValue({
							attr: vi.fn().mockReturnValue("/article1"),
							text: vi.fn().mockReturnValue("Article 1"),
							length: 1,
						}),
					},
				]),
			});

			const result = await fetchArticles(mockPage, mockBrowserPage as any);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				url: "https://example.com",
				link: "https://example.com/article1",
				title: "Article 1",
				description: "Article 1",
				date: expect.any(Date),
			});
		});

		it("should return an empty array when scraping is not allowed", async () => {
			const mockBrowserPage = {
				goto: vi.fn(),
				content: vi.fn(),
			};

			// Mock canScrape to return false
			vi.spyOn(global, "fetch").mockResolvedValueOnce({
				ok: true,
				text: vi.fn().mockResolvedValue("User-agent: *\nDisallow: /"),
			} as any);

			const result = await fetchArticles(mockPage, mockBrowserPage as any);

			expect(result).toEqual([]);
		});
	});
});
