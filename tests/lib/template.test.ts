import { promises as fs } from "node:fs";
import path from "node:path";
import { Mock, beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_PATH } from "../../src/lib/constants.js";
import { renderTemplate } from "../../src/lib/template.js";
import type { NewsletterData } from "../../src/types/index.js";

vi.mock("node:fs");
vi.mock("node:path");

describe("renderTemplate", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("should render the template correctly with provided data", async () => {
		const data: NewsletterData = {
			categories: ["Tech", "Health"],
			summary: "This is a summary.",
		};

		const fileName = "newsletter.hbs";
		const filePath = path.join(BASE_PATH, "views", fileName);
		const fileContent =
			"Categories: {{categories}}. Summary: {{summary}}. Date: {{date}}.";

		(fs.readFile as Mock).mockResolvedValue(fileContent);
		(path.join as Mock).mockReturnValue(filePath);

		const result = await renderTemplate(data, fileName);

		expect(fs.readFile).toHaveBeenCalledWith(filePath, "utf-8");
		expect(result).toContain("Categories: Tech,Health.");
		expect(result).toContain("Summary: This is a summary.");
		expect(result).toMatch(/Date: \w+, \w+ \d+, \d{4}/);
	});

	it("should use the default file name if none is provided", async () => {
		const data: NewsletterData = {
			categories: ["Tech"],
			summary: "Default summary.",
		};

		const defaultFileName = "newsletter.hbs";
		const filePath = path.join(BASE_PATH, "views", defaultFileName);
		const fileContent =
			"Categories: {{categories}}. Summary: {{summary}}. Date: {{date}}.";

		(fs.readFile as Mock).mockResolvedValue(fileContent);
		(path.join as Mock).mockReturnValue(filePath);

		const result = await renderTemplate(data);

		expect(fs.readFile).toHaveBeenCalledWith(filePath, "utf-8");
		expect(result).toContain("Categories: Tech.");
		expect(result).toContain("Summary: Default summary.");
		expect(result).toMatch(/Date: \w+, \w+ \d+, \d{4}/);
	});

	it("should handle empty categories and summary", async () => {
		const data: NewsletterData = {
			categories: [],
			summary: "",
		};

		const fileName = "newsletter.hbs";
		const filePath = path.join(BASE_PATH, "views", fileName);
		const fileContent =
			"Categories: {{categories}}. Summary: {{summary}}. Date: {{date}}.";

		(fs.readFile as Mock).mockResolvedValue(fileContent);
		(path.join as Mock).mockReturnValue(filePath);

		const result = await renderTemplate(data, fileName);

		expect(fs.readFile).toHaveBeenCalledWith(filePath, "utf-8");
		expect(result).toContain("Categories: .");
		expect(result).toContain("Summary: .");
		expect(result).toMatch(/Date: \w+, \w+ \d+, \d{4}/);
	});
});
