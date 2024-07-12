import fs from "node:fs";
import path from "node:path";
import { GenerateContentResult } from "@google/generative-ai";
import { Page } from "puppeteer";
import robotsParser, { Robot } from "robots-parser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { model } from "../../src/app";
import {
	BASE_PATH,
	DESCRIPTION_MAX_LENGTH,
	RECURRING_FREQUENCY,
} from "../../src/lib/constants";
import {
	checkRobotsTxtPermission,
	constructFullUrl,
	convertStringDatesToDate,
	fetchPageContent,
	generateJSONResponseFromModel,
	getPastWeekDate,
	retry,
	truncateDescription,
	useLogFile,
} from "../../src/lib/utils";
import type { PageToScrape } from "../../src/types";

vi.mock("@google/generative-ai", () => ({
	GoogleGenerativeAI: vi.fn(() => ({
		getGenerativeModel: vi.fn(() => ({
			generateContent: vi.fn(),
		})),
	})),
}));

vi.mock("../../src/lib/utils", async () => {
	const og = await vi.importActual("../../src/lib/utils");
	return { ...og, logAiCall: vi.fn() };
});

// Mock the external gemini-ai
vi.mock("../../src/app", () => ({
	model: {
		generateContent: vi.fn(),
	},
}));

describe("useLogFile", () => {
	let appendFileSpy;

	beforeEach(() => {
		appendFileSpy = vi
			.spyOn(fs, "appendFile")
			.mockImplementation((logPath, logMessage, callback) => callback(null));
	});

	afterEach(() => {
		appendFileSpy.mockRestore();
	});

	it("should write a log message with a timestamp", () => {
		const name = "test.log";
		const logMessage = "Test log message";
		const logFile = useLogFile(name);

		logFile(logMessage);

		const logPath = path.join(BASE_PATH, name);

		expect(appendFileSpy).toHaveBeenCalledWith(
			logPath,
			expect.stringContaining(logMessage),
			expect.any(Function),
		);
	});

	it("should handle errors during logging", () => {
		const consoleErrorMock = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const name = "error.log";
		const logMessage = "Test error log message";
		const errorMessage = "Test error";

		appendFileSpy.mockImplementationOnce((logPath, logMessage, callback) => {
			callback(new Error(errorMessage));
		});

		const logFile = useLogFile(name);

		logFile(logMessage);

		expect(consoleErrorMock).toHaveBeenCalledWith(
			`Failed to write to ${name}: ${errorMessage}`,
		);

		consoleErrorMock.mockRestore();
	});
});

describe("generateJSONResponseFromModel", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should parse valid JSON response", async () => {
		const mockResponse = {
			response: {
				text: () => '```json\n{"key": "value"}\n```',
			},
		} as GenerateContentResult;
		vi.mocked(model.generateContent).mockResolvedValue(mockResponse);

		const result = await generateJSONResponseFromModel("test prompt");
		expect(result).toEqual({ key: "value" });
	});

	it("should handle JSON response without code blocks", async () => {
		const mockResponse = {
			response: {
				text: () => '{"key": "value"}',
			},
		} as GenerateContentResult;
		vi.mocked(model.generateContent).mockResolvedValue(mockResponse);

		const result = await generateJSONResponseFromModel("test prompt");
		expect(result).toEqual({ key: "value" });
	});

	it("should return cleaned string for simple quoted string response", async () => {
		const mockResponse = {
			response: {
				text: () => '"simple string response"',
			},
		} as GenerateContentResult;
		vi.mocked(model.generateContent).mockResolvedValue(mockResponse);

		const result = await generateJSONResponseFromModel("test prompt");
		expect(result).toBe("simple string response");
	});

	it("should return original string for non-JSON, non-quoted response", async () => {
		const mockResponse = {
			response: {
				text: () => "plain text response",
			},
		} as GenerateContentResult;
		vi.mocked(model.generateContent).mockResolvedValue(mockResponse);

		const result = await generateJSONResponseFromModel("test prompt");
		expect(result).toBe("plain text response");
	});

	it("should handle empty response", async () => {
		const mockResponse = {
			response: {
				text: () => "",
			},
		} as GenerateContentResult;
		vi.mocked(model.generateContent).mockResolvedValue(mockResponse);

		const result = await generateJSONResponseFromModel("test prompt");
		expect(result).toBe("");
	});
});

describe("constructFullUrl", () => {
	const targetPage = {
		url: "https://example.com/",
		// Add other properties of PageToScrape if needed
	} as PageToScrape;

	it("should return undefined for undefined input", () => {
		expect(constructFullUrl(undefined, targetPage)).toBeUndefined();
	});

	it("should convert http to https for full URLs", () => {
		expect(constructFullUrl("http://example.com/test", targetPage)).toBe(
			"https://example.com/test",
		);
	});

	it("should keep https for full URLs", () => {
		expect(constructFullUrl("https://example.com/test", targetPage)).toBe(
			"https://example.com/test",
		);
	});

	it("should construct full URL for relative paths", () => {
		expect(constructFullUrl("/test", targetPage)).toBe(
			"https://example.com/test",
		);
	});

	it("should handle paths without leading slash", () => {
		expect(constructFullUrl("test", targetPage)).toBe("https://example.com/test");
	});

	it("should handle paths with multiple slashes", () => {
		expect(constructFullUrl("//test", targetPage)).toBe(
			"https://example.com/test",
		);
	});

	it("should handle base URLs with trailing slashes", () => {
		const pageWithTrailingSlash = {
			...targetPage,
			url: "https://example.com//",
		};
		expect(constructFullUrl("test", pageWithTrailingSlash)).toBe(
			"https://example.com/test",
		);
	});

	it("should handle common parts between base URL and path", () => {
		expect(constructFullUrl("page/subpage", targetPage)).toBe(
			"https://example.com/page/subpage",
		);
	});

	it("should handle complex relative paths", () => {
		expect(constructFullUrl("../../other/path", targetPage)).toBe(
			"https://example.com/other/path",
		);
	});

	it("should handle empty string input", () => {
		expect(constructFullUrl("", targetPage)).toBe("https://example.com/");
	});

	it("should handle base URL with query parameters", () => {
		const pageWithQuery = {
			...targetPage,
			url: "https://example.com/?key=value",
		};
		expect(constructFullUrl("test", pageWithQuery)).toBe(
			"https://example.com/test",
		);
	});

	it("should handle input with query parameters", () => {
		expect(constructFullUrl("/test?key=value", targetPage)).toBe(
			"https://example.com/test?key=value",
		);
	});

	it("should handle input with hash", () => {
		expect(constructFullUrl("/test#section", targetPage)).toBe(
			"https://example.com/test#section",
		);
	});
});

describe("convertStringDatesToDate", () => {
	it("should convert valid date strings to Date objects", () => {
		const input = [
			{ id: 1, date: "2023-05-15T10:00:00Z" },
			{ id: 2, date: "2023-06-20T14:30:00Z" },
		];
		const result = convertStringDatesToDate(input);
		expect(result[0].date).toBeInstanceOf(Date);
		expect(result[1].date).toBeInstanceOf(Date);
		expect(result[0].date?.toISOString()).toBe("2023-05-15T10:00:00.000Z");
		expect(result[1].date?.toISOString()).toBe("2023-06-20T14:30:00.000Z");
	});

	it("should handle mixed objects with and without date property", () => {
		const input = [
			{ id: 1, date: "2023-05-15T10:00:00Z" },
			{ id: 2, name: "Test" },
			{ id: 3, date: "2023-06-20T14:30:00Z" },
		];
		const result = convertStringDatesToDate(input);
		expect(result[0].date).toBeInstanceOf(Date);
		expect(result[1].date).toBeUndefined();
		expect(result[2].date).toBeInstanceOf(Date);
	});

	it("should handle empty array", () => {
		const input: { date?: string }[] = [];
		const result = convertStringDatesToDate(input);
		expect(result).toEqual([]);
	});

	it("should handle invalid date strings", () => {
		const input = [
			{ id: 1, date: "invalid-date" },
			{ id: 2, date: "2023-06-20T14:30:00Z" },
		];
		const result = convertStringDatesToDate(input);
		expect(result[0].date?.toString()).toBe("Invalid Date");
		expect(result[1].date).toBeInstanceOf(Date);
	});

	it("should preserve other properties in the objects", () => {
		const input = [
			{ id: 1, date: "2023-05-15T10:00:00Z", name: "Test 1" },
			{ id: 2, date: "2023-06-20T14:30:00Z", name: "Test 2" },
		];
		const result = convertStringDatesToDate(input);
		expect(result[0]).toEqual({
			id: 1,
			date: expect.any(Date),
			name: "Test 1",
		});
		expect(result[1]).toEqual({
			id: 2,
			date: expect.any(Date),
			name: "Test 2",
		});
	});

	it("should handle undefined date values", () => {
		const input = [
			{ id: 1, date: undefined },
			{ id: 2, date: "2023-06-20T14:30:00Z" },
		];
		const result = convertStringDatesToDate(input);
		expect(result[0].date).toBeUndefined();
		expect(result[1].date).toBeInstanceOf(Date);
	});

	it("should handle different date formats", () => {
		const input = [
			{ id: 1, date: "2023-05-15" },
			{ id: 2, date: "2023/06/20" },
			{ id: 3, date: "May 25, 2023" },
		];
		const result = convertStringDatesToDate(input);
		expect(result.every((item) => (item.date as any) instanceof Date)).toBe(true);
	});
});

describe("truncateDescription", () => {
	it("should not truncate descriptions shorter than max length", () => {
		const input = "This is a short description.";
		expect(truncateDescription(input)).toBe(input);
	});

	it("should truncate descriptions longer than max length", () => {
		const input =
			"one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty thirtyone thirtytwo thirtythree thirtyfour thirtyfive thirtysix thirtyseven thirtyeight thirtynine forty";

		const result = truncateDescription(input);
		expect(result).toBe(
			"one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty thirtyone thirtytwo thirtythree thirtyfour thirtyfive...",
		);
		expect(result.split(" ").length).toBeLessThanOrEqual(DESCRIPTION_MAX_LENGTH);
		expect(result.endsWith("...")).toBe(true);
	});

	it("should not truncate description that is exactly the max length", () => {
		const input =
			"one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty.";
		const result = truncateDescription(input);
		expect(result).toBe(input);
	});

	it("should remove trailing punctuation", () => {
		const input = "This description ends with punctuation!!!!";
		const result = truncateDescription(input);
		expect(result).toBe("This description ends with punctuation.");
	});

	it("should handle descriptions with multiple spaces between words", () => {
		const input =
			"This   description   has   multiple   spaces   between   words.";
		const result = truncateDescription(input);
		expect(result.split(" ").every((word) => word !== "")).toBe(true);
	});

	it("should handle descriptions with leading/trailing spaces", () => {
		const input = "   This description has leading and trailing spaces.   ";
		expect(truncateDescription(input)).toBe(
			"This description has leading and trailing spaces.",
		);
	});

	it("should handle empty string", () => {
		expect(truncateDescription("")).toBe("");
	});

	it("should handle descriptions with unicode characters", () => {
		const input =
			"This description contains unicode characters like 😊 and 你好.";
		const result = truncateDescription(input);
		expect(result).toContain("😊");
		expect(result).toContain("你好");
	});

	it("should handle descriptions with newlines", () => {
		const input = "This description\nhas multiple\nlines.";
		expect(truncateDescription(input)).toBe(
			"This description has multiple lines.",
		);
	});

	it("should not add ellipsis if truncation occurs at word boundary", () => {
		const input = "This description is exactly the maximum length allowed.";
		const result = truncateDescription(input);
		expect(result).toBe(input);
		expect(result.endsWith("...")).toBe(false);
	});

	it("should handle descriptions with only spaces", () => {
		const input = "     ";
		expect(truncateDescription(input)).toBe("");
	});
});

const mockBrowserInstance = {
	goto: vi.fn(),
	content: vi.fn(),
} as unknown as Page;

describe("fetchPageContent", () => {
	it("should return content when fetch is successful", async () => {
		const mockUrl = "https://example.com";
		const mockResponseText = "mock content";
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			text: vi.fn().mockResolvedValue(mockResponseText),
		});

		const result = await fetchPageContent(mockUrl, mockBrowserInstance);

		expect(result).toBe(mockResponseText);
		expect(global.fetch).toHaveBeenCalledWith(mockUrl);
		expect(mockBrowserInstance.goto).not.toHaveBeenCalled();
		expect(mockBrowserInstance.content).not.toHaveBeenCalled();
	});

	it("should return content from browserInstance when fetch fails", async () => {
		const mockUrl = "https://example.com";
		const mockBrowserContent = "browser content";
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
		});
		mockBrowserInstance.goto = vi.fn().mockResolvedValue({});
		mockBrowserInstance.content = vi.fn().mockResolvedValue(mockBrowserContent);

		const result = await fetchPageContent(mockUrl, mockBrowserInstance);

		expect(result).toBe(mockBrowserContent);
		expect(global.fetch).toHaveBeenCalledWith(mockUrl);
		expect(mockBrowserInstance.goto).toHaveBeenCalledWith(mockUrl);
		expect(mockBrowserInstance.content).toHaveBeenCalled();
	});

	it("should handle fetch error and return content from browserInstance", async () => {
		const mockUrl = "https://example.com";
		const mockBrowserContent = "browser content";
		global.fetch = vi.fn().mockRejectedValue(new Error("Fetch error"));
		mockBrowserInstance.goto = vi.fn().mockResolvedValue({});
		mockBrowserInstance.content = vi.fn().mockResolvedValue(mockBrowserContent);

		const result = await fetchPageContent(mockUrl, mockBrowserInstance);

		expect(result).toBe(mockBrowserContent);
		expect(global.fetch).toHaveBeenCalledWith(mockUrl);
		expect(mockBrowserInstance.goto).toHaveBeenCalledWith(mockUrl);
		expect(mockBrowserInstance.content).toHaveBeenCalled();
	});

	it("should throw error when both fetch and browserInstance fail", async () => {
		const mockUrl = "https://example.com";
		global.fetch = vi.fn().mockRejectedValue(new Error("Fetch error"));
		mockBrowserInstance.goto = vi
			.fn()
			.mockRejectedValue(new Error("Browser error"));

		await expect(fetchPageContent(mockUrl, mockBrowserInstance)).rejects.toThrow(
			"Browser error",
		);
		expect(global.fetch).toHaveBeenCalledWith(mockUrl);
		expect(mockBrowserInstance.goto).toHaveBeenCalledWith(mockUrl);
		expect(mockBrowserInstance.content).toHaveBeenCalled();
		expect(mockBrowserInstance.goto).toHaveBeenCalledWith(mockUrl);
	});
});

describe("getPastWeekDate", () => {
	const currentDate = new Date("2024-07-12T00:00:00Z");
	const pastDate = new Date(currentDate.getTime() - RECURRING_FREQUENCY);
	const formattedCurrentDate = currentDate.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
	const formattedPastDate = pastDate.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(currentDate);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should return the correct start and end dates for the past week", () => {
		const result = getPastWeekDate();
		expect(result.start).toBe(formattedPastDate);
		expect(result.end).toBe(formattedCurrentDate);
		expect(result.year).toBe(currentDate.getFullYear());
	});

	it("should have start date before end date", () => {
		const result = getPastWeekDate();
		expect(new Date(result.start).getTime()).toBeLessThan(
			new Date(result.end).getTime(),
		);
	});
});

// Mock the fetch function
vi.mock("node-fetch", () => ({
	default: vi.fn(),
}));

// Mock the robotsParser function
vi.mock("robots-parser", () => ({
	default: vi.fn(),
}));

describe("checkRobotsTxtPermission", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return true when robots.txt allows scraping", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: () => Promise.resolve("User-agent: *\nAllow: /"),
		});
		vi.mocked(fetch).mockImplementation(mockFetch);

		vi.mocked(robotsParser).mockReturnValue({
			isAllowed: () => true,
		} as unknown as Robot);

		const result = await checkRobotsTxtPermission("https://example.com");
		expect(result).toBe(true);
		expect(mockFetch).toHaveBeenCalledWith("https://example.com/robots.txt", {
			redirect: "follow",
		});
	});

	it("should return false when robots.txt disallows scraping", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: () => Promise.resolve("User-agent: *\nDisallow: /"),
		});
		vi.mocked(fetch).mockImplementation(mockFetch);

		vi.mocked(robotsParser).mockReturnValue({
			isAllowed: () => false,
		} as unknown as Robot);

		const result = await checkRobotsTxtPermission("https://example.com");
		expect(result).toBe(false);
	});

	it("should return true when robots.txt cannot be fetched", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 404,
			statusText: "Not Found",
		});
		vi.mocked(fetch).mockImplementation(mockFetch);

		const result = await checkRobotsTxtPermission("https://example.com");
		expect(result).toBe(true);
	});

	it("should return false when an error occurs during the process", async () => {
		const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
		vi.mocked(fetch).mockImplementation(mockFetch);

		const result = await checkRobotsTxtPermission("https://example.com");
		expect(result).toBe(false);
	}, 10000);
});

describe("retry", () => {
	it("should return result on first attempt", async () => {
		const mockFn = vi.fn().mockResolvedValue("success");

		const result = await retry(mockFn);

		expect(result).toBe("success");
		expect(mockFn).toHaveBeenCalledTimes(1);
	});

	it("should retry and eventually succeed", async () => {
		const mockFn = vi
			.fn()
			.mockRejectedValueOnce(new Error("fail"))
			.mockRejectedValueOnce(new Error("fail"))
			.mockResolvedValue("success");

		const result = await retry(mockFn);

		expect(result).toBe("success");
		expect(mockFn).toHaveBeenCalledTimes(3);
	}, 30000);

	it("should throw an error after max retries", async () => {
		const mockFn = vi.fn().mockRejectedValue(new Error("fail"));

		await expect(retry(mockFn)).rejects.toThrow("fail");
		expect(mockFn).toHaveBeenCalledTimes(3);
	}, 30000);

	it("should retry up to specified maxRetries", async () => {
		const mockFn = vi.fn().mockRejectedValue(new Error("fail"));

		await expect(retry(mockFn, 5)).rejects.toThrow("fail");
		expect(mockFn).toHaveBeenCalledTimes(5);
	}, 300000);

	it("should wait exponentially between retries", async () => {
		const mockFn = vi.fn().mockRejectedValue(new Error("fail"));

		const start = Date.now();
		await expect(retry(mockFn, 3)).rejects.toThrow("fail");
		const end = Date.now();
		const duration = end - start;

		// Minimum wait time is 2^1 * 1000 + 2^2 * 1000 + 2^3 * 1000 = 7000ms
		expect(duration).toBeGreaterThanOrEqual(6000);
		expect(mockFn).toHaveBeenCalledTimes(3);
	}, 300000);
});
