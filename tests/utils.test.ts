import { beforeEach, describe, expect, it, vi } from "vitest";
import { DESCRIPTION_MAX_LENGTH } from "../src/lib/constants";
import {
	combineUrlParts,
	convertHttpToHttps,
	formatDescription,
	generateJsonResponse,
	generateStringResponse,
	parseJsonDate,
	tryFetchPageHTML,
} from "../src/lib/utils";

// Mock the GoogleGenerativeAI module
vi.mock("@google/generative-ai", () => ({
	GoogleGenerativeAI: vi.fn(() => ({
		getGenerativeModel: vi.fn(() => ({
			generateContent: vi.fn(),
		})),
	})),
}));

// Mock the initializeGenAI function
vi.mock("../src/lib/ai", () => ({
	initializeGenAI: vi.fn(),
}));

import { initializeGenAI } from "../src/lib/ai";

describe("Utils", () => {
	let mockModel: any;

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup mock model for each test
		mockModel = {
			generateContent: vi.fn(),
		};
		(initializeGenAI as any).mockReturnValue(mockModel);
	});

	describe("generateStringResponse", () => {
		it("should return a string response", async () => {
			const mockText = "Test response";
			mockModel.generateContent.mockResolvedValue({
				response: {
					text: () => mockText,
				},
			});

			const result = await generateStringResponse("Test prompt");
			expect(result).toBe(mockText);
			expect(mockModel.generateContent).toHaveBeenCalledWith("Test prompt");
		});
	});

	describe("generateJsonResponse", () => {
		it("should return a parsed JSON response", async () => {
			const mockJsonString = '```json\n[{"key": "value"}]\n```';
			mockModel.generateContent.mockResolvedValue({
				response: {
					text: () => mockJsonString,
					usageMetadata: {},
				},
			});

			const result = await generateJsonResponse("Test prompt");
			expect(result).toEqual([{ key: "value" }]);
			expect(mockModel.generateContent).toHaveBeenCalledWith("Test prompt");
		});

		it("should throw an error for invalid JSON", async () => {
			const mockInvalidJsonString = "```json\n{invalid json}\n```";
			mockModel.generateContent.mockResolvedValue({
				response: {
					text: () => mockInvalidJsonString,
					usageMetadata: {},
				},
			});

			await expect(generateJsonResponse("Test prompt")).rejects.toThrow();
		});
	});
	describe("convertHttpToHttps", () => {
		it("should convert http to https", () => {
			expect(convertHttpToHttps("http://example.com")).toBe("https://example.com");
		});

		it("should not modify https urls", () => {
			expect(convertHttpToHttps("https://example.com")).toBe(
				"https://example.com",
			);
		});

		it("should not modify non-http urls", () => {
			expect(convertHttpToHttps("ftp://example.com")).toBe("ftp://example.com");
		});
	});

	describe("combineUrlParts", () => {
		it("should combine base URL and path", () => {
			expect(combineUrlParts("https://example.com", "path/to/resource")).toBe(
				"https://example.com/path/to/resource",
			);
		});

		it("should handle trailing slashes", () => {
			expect(combineUrlParts("https://example.com/", "/path/to/resource")).toBe(
				"https://example.com/path/to/resource",
			);
		});

		it("should return undefined if path is undefined", () => {
			expect(combineUrlParts("https://example.com", undefined)).toBeUndefined();
		});

		it("should remove overlapping parts", () => {
			expect(combineUrlParts("https://example.com/api", "api/resource")).toBe(
				"https://example.com/api/resource",
			);
		});
	});

	describe("parseJsonDate", () => {
		it("should parse date strings to Date objects", () => {
			const input = [{ date: "2023-01-01" }, { date: "2023-01-02" }];
			const result = parseJsonDate(input);
			expect(result[0].date).toBeInstanceOf(Date);
			expect(result[1].date).toBeInstanceOf(Date);
		});

		it("should handle undefined dates", () => {
			const input = [{ date: "2023-01-01" }, { otherField: "value" }];
			const result = parseJsonDate(input);
			expect(result[0].date).toBeInstanceOf(Date);
			expect(result[1].date).toBeUndefined();
		});
	});

	describe("formatDescription", () => {
		it("should truncate description to DESCRIPTION_MAX_LENGTH words", () => {
			const longDescription =
				"This is a very long description that exceeds the maximum length.".repeat(
					10,
				);
			const result = formatDescription(longDescription);
			const wordCount = result.split(" ").length;
			expect(wordCount).toBeLessThanOrEqual(DESCRIPTION_MAX_LENGTH);
		});

		it("should add ellipsis if truncated", () => {
			const longDescription =
				"This is a very long description that exceeds the maximum length.".repeat(
					10,
				);
			const result = formatDescription(longDescription);
			expect(result.endsWith("...")).toBe(true);
		});

		it("should not add ellipsis if description ends with a period", () => {
			const description = "This is a short description.";
			const result = formatDescription(description);
			expect(result).toBe(description);
		});
	});

	describe("tryFetchPageHTML", () => {
		it("should fetch HTML using fetch when successful", async () => {
			const mockUrl = "https://example.com";
			const mockHtml = "<html><body>Test</body></html>";

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				text: vi.fn().mockResolvedValue(mockHtml),
			});

			const mockBrowserPage = {
				goto: vi.fn(),
				content: vi.fn(),
			};

			const result = await tryFetchPageHTML(mockUrl, mockBrowserPage as any);

			expect(result).toBe(mockHtml);
			expect(global.fetch).toHaveBeenCalledWith(mockUrl);
			expect(mockBrowserPage.goto).not.toHaveBeenCalled();
		});

		it("should use browserPage when fetch fails", async () => {
			const mockUrl = "https://example.com";
			const mockHtml = "<html><body>Test</body></html>";

			(global.fetch as any).mockRejectedValueOnce(new Error("Fetch failed"));

			const mockBrowserPage = {
				goto: vi.fn(),
				content: vi.fn().mockResolvedValue(mockHtml),
			};

			const result = await tryFetchPageHTML(mockUrl, mockBrowserPage as any);

			expect(result).toBe(mockHtml);
			expect(global.fetch).toHaveBeenCalledWith(mockUrl);
			expect(mockBrowserPage.goto).toHaveBeenCalledWith(mockUrl);
			expect(mockBrowserPage.content).toHaveBeenCalled();
		});
	});
});
