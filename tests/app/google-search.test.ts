import { google } from "googleapis";
import { Mock, beforeEach, describe, expect, it, vi } from "vitest";
import { getLastDateQuery, searchNews } from "../../src/app/google-search.js";
import { RECURRING_FREQUENCY } from "../../src/lib/constants.js";

describe("getLastDateQuery", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("should return the query with the date suffix using default beforeMs", () => {
		const query = "example query";
		const currentTime = new Date().getTime();
		const pastDate = new Date(currentTime - RECURRING_FREQUENCY)
			.toISOString()
			.split("T")[0];
		const expectedQuery = `${query} after:${pastDate}`;

		const result = getLastDateQuery(query);

		expect(result).toBe(expectedQuery);
	});

	it("should return the query with the date suffix using custom beforeMs", () => {
		const query = "example query";
		const customBeforeMs = 30 * 24 * 60 * 60 * 1000; // e.g., 30 days in milliseconds
		const currentTime = new Date().getTime();
		const pastDate = new Date(currentTime - customBeforeMs)
			.toISOString()
			.split("T")[0];
		const expectedQuery = `${query} after:${pastDate}`;

		const result = getLastDateQuery(query, customBeforeMs);

		expect(result).toBe(expectedQuery);
	});

	it("should return the original query if an error occurs", () => {
		const query = "example query";

		// Mock Date to throw an error
		const originalDate = global.Date;
		global.Date = vi.fn(() => {
			throw new Error("Date error");
		}) as any;

		const result = getLastDateQuery(query);

		expect(result).toBe(query);

		// Restore original Date
		global.Date = originalDate;
	});
});

vi.mock("googleapis", () => ({
	google: {
		customsearch: vi.fn().mockReturnValue({
			cse: { list: vi.fn() },
		}),
	},
}));

vi.mock("../../src/lib/utils.js", () => ({
	retry: async (fn) => fn(),
}));

describe("searchNews", () => {
	let customsearch = google.customsearch("v1");
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("should return valid results", async () => {
		const queries = ["example query"];
		const mockResponse = {
			data: {
				items: [
					{
						title: "Example Title",
						link: "https://example.com",
						snippet: "Example snippet",
					},
				],
			},
		};

		const getLastDateQuerySpy = vi
			.spyOn({ getLastDateQuery }, "getLastDateQuery")
			.mockReturnValue("example query after:2023-01-01");
		(customsearch.cse.list as Mock).mockResolvedValue(mockResponse);

		const results = await searchNews(queries);

		expect(results).toEqual([
			{
				title: "Example Title",
				link: "https://example.com",
				snippet: "Example snippet",
			},
		]);
		expect(getLastDateQuerySpy).toHaveBeenCalled();
	});

	it("should handle no results for a query", async () => {
		const queries = ["example query"];
		const mockResponse = {
			data: {
				items: [],
			},
		};

		const getLastDateQuerySpy = vi
			.spyOn({ getLastDateQuery }, "getLastDateQuery")
			.mockReturnValue("example query after:2023-01-01");
		(customsearch.cse.list as Mock).mockResolvedValue(mockResponse);

		const results = await searchNews(queries);

		expect(results).toEqual([]);
		expect(getLastDateQuerySpy).toHaveBeenCalled();
	});

	it("should continue to the next query if an error occurs", async () => {
		const queries = ["example query"];
		const mockError = new Error("API error");

		const getLastDateQuerySpy = vi
			.spyOn({ getLastDateQuery }, "getLastDateQuery")
			.mockReturnValue("example query after:2023-01-01");
		(customsearch.cse.list as Mock).mockRejectedValue(mockError);

		const results = await searchNews(queries);

		expect(results).toEqual([]);
		expect(getLastDateQuerySpy).toHaveBeenCalled();
	}, 30000);

	it("should retry on failure", async () => {
		const queries = ["example query"];
		const mockResponse = {
			data: {
				items: [
					{
						title: "Example Title",
						link: "https://example.com",
						snippet: "Example snippet",
					},
				],
			},
		};

		const getLastDateQuerySpy = vi
			.spyOn({ getLastDateQuery }, "getLastDateQuery")
			.mockReturnValue("example query after:2023-01-01");
		(customsearch.cse.list as Mock)
			.mockRejectedValueOnce(new Error("Temporary error"))
			.mockResolvedValueOnce(mockResponse);

		const results = await searchNews(queries);

		expect(results).toEqual([
			{
				title: "Example Title",
				link: "https://example.com",
				snippet: "Example snippet",
			},
		]);
		expect(getLastDateQuerySpy).toHaveBeenCalled();
	}, 30000);
});

describe("safeSingleSearch", () => {
	it.todo("should safely search news using Google Custom Search API");
});
