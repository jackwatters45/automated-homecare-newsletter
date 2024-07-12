import { GoogleGenerativeAI } from "@google/generative-ai";
import { Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeGenAI } from "../../src/lib/ai";

vi.mock("@google/generative-ai", () => {
	return {
		GoogleGenerativeAI: vi.fn(),
	};
});

describe("initializeGenAI", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		vi.resetModules();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it("should throw an error if GEMINI_API_KEY is not set", () => {
		delete process.env.GEMINI_API_KEY;

		expect(() => initializeGenAI()).toThrow(
			"GEMINI_API_KEY environment variable is not set",
		);
	});

	it("should initialize GoogleGenerativeAI with the provided API key", () => {
		const apiKey = "test-api-key";
		process.env.GEMINI_API_KEY = apiKey;

		const getGenerativeModelMock = vi.fn();
		(GoogleGenerativeAI as unknown as Mock).mockImplementation(() => {
			return {
				getGenerativeModel: getGenerativeModelMock,
			};
		});

		initializeGenAI();

		expect(GoogleGenerativeAI).toHaveBeenCalledWith(apiKey);
		expect(getGenerativeModelMock).toHaveBeenCalledWith({
			model: "gemini-1.5-flash",
			systemInstruction:
				"You are a homecare business operator. You an expeert in homecare news and are tasked with choosing which articles to include in a newsletter as well as generating a summary for the newsletter and cleaning up the content of the articles.",
		});
	});
});
