import { processArticles } from "@/data/format-articles";
import Bottleneck from "bottleneck";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateStringResponse, tryFetchPageHTML } from "../src/lib/utils";
import type { ValidArticleData } from "../types";

// Mock dependencies
vi.mock("./data-fetching");
vi.mock("../lib/utils");
vi.mock("bottleneck");

describe("processArticles", () => {
	const mockPage = {} as any;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should process articles with existing descriptions", async () => {
		const rankedArticles = [
			{
				title: "Test Article",
				link: "https://example.com",
				description: "Existing description",
			},
		];

		const result = await processArticles(rankedArticles, mockPage);

		expect(result).toEqual([
			{
				title: "Test Article",
				link: "https://example.com",
				description: "Existing description",
			},
		]);
		expect(tryFetchPageHTML).not.toHaveBeenCalled();
		expect(generateStringResponse).not.toHaveBeenCalled();
	});

	it("should fetch and generate descriptions for articles without descriptions", async () => {
		const rankedArticles = [
			{ title: "Test Article", link: "https://example.com", description: null },
		] as unknown as ValidArticleData[];

		vi
			.mocked(tryFetchPageHTML)
			.mockResolvedValue("<html><body>Article content</body></html>");
		vi.mocked(generateStringResponse).mockResolvedValue("Generated description");

		const result = await processArticles(rankedArticles, mockPage);

		expect(result).toEqual([
			{
				title: "Test Article",
				link: "https://example.com",
				description: "Generated description",
			},
		]);
		expect(tryFetchPageHTML).toHaveBeenCalledWith(
			"https://example.com",
			mockPage,
		);
		expect(generateStringResponse).toHaveBeenCalled();
	});

	it("should use Bottleneck to limit concurrent requests", async () => {
		const rankedArticles = [
			{ title: "Article 1", link: "https://example1.com", description: null },
			{ title: "Article 2", link: "https://example2.com", description: null },
		] as unknown as ValidArticleData[];

		vi
			.mocked(tryFetchPageHTML)
			.mockResolvedValue("<html><body>Article content</body></html>");
		vi.mocked(generateStringResponse).mockResolvedValue("Generated description");

		const mockSchedule = vi.fn().mockImplementation((fn) => fn());
		vi.mocked(Bottleneck).mockReturnValue({ schedule: mockSchedule } as any);

		await processArticles(rankedArticles, mockPage);

		expect(mockSchedule).toHaveBeenCalledTimes(2);
	});

	it("should handle errors gracefully", async () => {
		const rankedArticles = [
			{ title: "Error Article", link: "https://error.com", description: null },
		] as unknown as ValidArticleData[];

		vi.mocked(tryFetchPageHTML).mockRejectedValue(new Error("Fetch failed"));

		const result = await processArticles(rankedArticles, mockPage);

		expect(result).toEqual([]);
		expect(tryFetchPageHTML).toHaveBeenCalledWith("https://error.com", mockPage);
		expect(generateStringResponse).not.toHaveBeenCalled();
	});
});
