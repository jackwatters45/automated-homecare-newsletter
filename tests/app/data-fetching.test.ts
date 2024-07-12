import * as cheerio from "cheerio";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	extractArticleData,
	scrapeArticles,
} from "../../src/app/data-fetching";
import {
	checkRobotsTxtPermission,
	constructFullUrl,
	fetchPageContent,
} from "../../src/lib/utils";

// Mock the external dependencies
vi.mock("../../src/lib/utils", () => ({
	checkRobotsTxtPermission: vi.fn(),
	fetchPageContent: vi.fn(),
	retry: vi.fn((fn) => fn()),
	ensureHttps: vi.fn((url) => (url.startsWith("http") ? url : `https://${url}`)),
	constructFullUrl: vi.fn(),
}));

describe("scrapeArticles", () => {
	const mockPage = {} as any;
	const mockTargetPage = {
		url: "https://example.com",
		articleContainerSelector: ".article",
		linkSelector: "a",
		titleSelector: "h2",
		descriptionSelector: "p",
		dateSelector: "time",
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return an empty array if robots.txt disallows scraping", async () => {
		vi.mocked(checkRobotsTxtPermission).mockResolvedValue(false);

		const result = await scrapeArticles(mockTargetPage, mockPage);

		expect(result).toEqual([]);
		expect(checkRobotsTxtPermission).toHaveBeenCalledWith(mockTargetPage.url);
	});

	it("should return an empty array if page content is empty", async () => {
		vi.mocked(checkRobotsTxtPermission).mockResolvedValue(true);
		vi.mocked(fetchPageContent).mockResolvedValue("");

		const result = await scrapeArticles(mockTargetPage, mockPage);

		expect(result).toEqual([]);
	});

	it("should scrape articles successfully", async () => {
		vi.mocked(checkRobotsTxtPermission).mockResolvedValue(true);
		vi.mocked(fetchPageContent).mockResolvedValue(`
	      <div class="article">
	        <h2>Title 1</h2>
	        <p>Description 1</p>
	        <time>2023-01-01</time>
	        <a href="/article1">Link 1</a>
	      </div>
	      <div class="article">
	        <h2>Title 2</h2>
	        <p>Description 2</p>
	        <time>2023-01-02</time>
	        <a href="https://example.com/article2">Link 2</a>
	      </div>
	    `);
		vi
			.mocked(constructFullUrl)
			.mockReturnValueOnce("https://example.com/article1")
			.mockReturnValueOnce("https://example.com/article2");

		const result = await scrapeArticles(mockTargetPage, mockPage);

		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			url: "https://example.com",
			link: "https://example.com/article1",
			title: "Title 1",
			description: "Description 1",
			date: new Date("2023-01-01"),
		});
		expect(result[1]).toEqual({
			url: "https://example.com",
			link: "https://example.com/article2",
			title: "Title 2",
			description: "Description 2",
			date: new Date("2023-01-02"),
		});
	});
});

describe("extractArticleData", () => {
	const mockTargetPage = {
		url: "https://example.com",
		articleContainerSelector: ".article",
		linkSelector: "a",
		titleSelector: "h2",
		descriptionSelector: "p",
		dateSelector: "time",
	};

	it("should extract article data correctly", () => {
		const html = `
      <div class="article">
        <h2>Test Title</h2>
        <p>Test Description</p>
        <time>2023-01-01</time>
        <a href="https://example.com/test-article">Read More</a>
      </div>
    `;
		const $ = cheerio.load(html);
		const element = $(".article")[0];

		vi
			.mocked(constructFullUrl)
			.mockReturnValueOnce("https://example.com/test-article");

		const result = extractArticleData({ targetPage: mockTargetPage, $, element });

		expect(result).toEqual({
			url: "https://example.com",
			link: "https://example.com/test-article",
			title: "Test Title",
			description: "Test Description",
			date: new Date("2023-01-01"),
		});
	});

	it("should handle missing data", () => {
		const html = '<div class="article"><h2>Only Title</h2></div>';
		const $ = cheerio.load(html);
		const element = $(".article")[0];

		const result = extractArticleData({ targetPage: mockTargetPage, $, element });

		expect(result).toEqual({
			url: "https://example.com",
			link: undefined,
			title: "Only Title",
			description: undefined,
			date: undefined,
		});
	});
});

function extractTextContent(
	$: cheerio.CheerioAPI,
	element: cheerio.AnyNode,
	selector: string | undefined,
): string | undefined {
	return $(element).find(selector).length
		? $(element).find(selector).text().trim()
		: undefined;
}

function extractDate(
	$: cheerio.CheerioAPI,
	element: cheerio.AnyNode,
	selector: string | undefined,
): Date | undefined {
	return $(element).find(selector).length
		? new Date($(element).find(selector).text().trim())
		: undefined;
}

describe("extractTextContent", () => {
	it("should extract text content correctly", () => {
		const html = `
      <div class="article">
        <p>Test Content</p>
      </div>
    `;
		const $ = cheerio.load(html);
		const element = $(".article")[0];

		const result = extractTextContent($, element, "p");

		expect(result).toEqual("Test Content");
	});

	it("should return undefined if text content selector is not found", () => {
		const html = `
      <div class="article">
        <p>Test Content</p>
      </div>
    `;
		const $ = cheerio.load(html);
		const element = $(".article")[0];

		const result = extractTextContent($, element, "h2");

		expect(result).toBeUndefined();
	});
});

describe("extractDate", () => {
	it("should extract date correctly", () => {
		const html = `
      <div class="article">
        <time>2023-01-01</time>
      </div>
    `;
		const $ = cheerio.load(html);
		const element = $(".article")[0];

		const result = extractDate($, element, "time");

		expect(result).toEqual(new Date("2023-01-01"));
	});

	it("should return undefined if date selector is not found", () => {
		const html = `
      <div class="article">
        <time>2023-01-01</time>
      </div>
    `;
		const $ = cheerio.load(html);
		const element = $(".article")[0];

		const result = extractDate($, element, "p");

		expect(result).toBeUndefined();
	});
});
