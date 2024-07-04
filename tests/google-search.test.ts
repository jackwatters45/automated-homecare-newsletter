import { google } from "googleapis";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLastWeekQuery, searchNews } from "../src/data/google-search";
import { RECURRING_FREQUENCY } from "../src/lib/constants";

// Mock the googleapis module
vi.mock("googleapis", () => ({
	google: {
		customsearch: vi.fn(() => ({
			cse: {
				list: vi.fn(),
			},
		})),
	},
}));

describe("Google Custom Search", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();

		// Mock environment variables
		process.env.CUSTOM_ENGINE_ID = "mock-engine-id";
		process.env.CUSTOM_SEARCH_API_KEY = "mock-api-key";
	});

	describe("getLastWeekQuery", () => {
		it("should format the query with the correct date", () => {
			// Mock Date.now() to return a fixed timestamp
			const mockDate = new Date("2023-07-01T12:00:00Z");
			vi.spyOn(global, "Date").mockImplementation(() => mockDate as any);

			const result = getLastWeekQuery("test query");

			// Calculate the expected date
			const pastWeek = new Date(mockDate.getTime() - RECURRING_FREQUENCY);
			const expectedDate = pastWeek.toISOString().split("T")[0];

			expect(result).toBe(`test query after:${expectedDate}`);
		});
	});

	describe("searchNews", () => {
		it("should call the Google Custom Search API with correct parameters", async () => {
			const mockApiResponse = {
				data: {
					items: [
						{
							title: "Test Title",
							link: "http://test.com",
							snippet: "Test Description",
						},
					],
				},
			};

			// Mock the API call
			const mockCseList = vi.fn().mockResolvedValue(mockApiResponse);
			vi.mocked(google.customsearch).mockReturnValue({
				cse: { list: mockCseList },
			} as any);

			const result = await searchNews(["test query"]);

			// Check if the API was called with correct parameters
			expect(mockCseList).toHaveBeenCalledWith({
				cx: "mock-engine-id",
				auth: "mock-api-key",
				q: expect.stringContaining("test query after:"),
			});

			// Check if the results are formatted correctly
			expect(result).toEqual([
				{
					title: "Test Title",
					link: "http://test.com",
					description: "Test Description",
				},
			]);
		});

		it("should return undefined if no items are returned", async () => {
			const mockApiResponse = { data: {} };

			// Mock the API call
			const mockCseList = vi.fn().mockResolvedValue(mockApiResponse);
			vi.mocked(google.customsearch).mockReturnValue({
				cse: { list: mockCseList },
			} as any);

			const result = await searchNews(["test query"]);

			expect(result).toBeUndefined();
		});

		it("should throw an error if the API call fails", async () => {
			// Mock the API call to throw an error
			const mockCseList = vi.fn().mockRejectedValue(new Error("API Error"));
			vi.mocked(google.customsearch).mockReturnValue({
				cse: { list: mockCseList },
			} as any);

			await expect(searchNews(["test query"])).rejects.toThrow("API Error");
		});
	});
});
