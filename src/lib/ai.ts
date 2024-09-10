import "dotenv/config";
import {
	type GenerativeModel,
	GoogleGenerativeAI,
} from "@google/generative-ai";
import debug from "debug";
import { z } from "zod";
import { AppError } from "./errors.js";

const log = debug(`${process.env.APP_NAME}:ai.ts`);

type TextParams = {
	prompt: string;
};

type JsonParams<T extends z.ZodTypeAny> = {
	prompt: string;

	schema: T;
};

type TextResult = {
	content: string;
};

type JsonResult<T extends z.ZodTypeAny> = {
	content: z.infer<T>;
	rawResponse: string;
};

class AIUtility {
	private model: GenerativeModel;

	constructor() {
		const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
		if (!apiKey) {
			throw new AppError(
				"GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set",
			);
		}

		const genAI = new GoogleGenerativeAI(apiKey);
		this.model = genAI.getGenerativeModel({
			model: "gemini-1.5-flash",
			systemInstruction:
				"You are a homecare business operator. You are an expert in homecare news and are tasked with choosing which articles to include in a newsletter as well as generating a summary for the newsletter and cleaning up the content of the articles.",
		});
	}

	async generateTextResponse(params: TextParams): Promise<TextResult> {
		const formatInstruction =
			"Respond with plain text. Do not use any Markdown formatting or special characters for emphasis or structure.";
		const fullPrompt = `${formatInstruction}\n\n${params.prompt}`;

		const result = await this.model.generateContent(fullPrompt);
		const response = await result.response;
		const text = response.text();

		return this.parseTextResponse(text);
	}

	async generateJsonResponse<T extends z.ZodTypeAny>(
		params: JsonParams<T>,
	): Promise<JsonResult<T>> {
		let formatInstruction =
			"Respond with a valid JSON object or array. Your entire response should be valid JSON without any additional text. Ensure all required fields are included in your response.";

		if (params.schema instanceof z.ZodObject) {
			const shape = params.schema.shape;
			const fields = Object.keys(shape)
				.map((key) => `"${key}"`)
				.join(", ");
			formatInstruction += ` The JSON object should include the following fields: ${fields}.`;
		} else if (params.schema instanceof z.ZodArray) {
			formatInstruction += " The response should be an array of objects.";
			if (params.schema.element instanceof z.ZodObject) {
				const shape = params.schema.element.shape;
				const fields = Object.keys(shape)
					.map((key) => `"${key}"`)
					.join(", ");
				formatInstruction += ` Each object in the array should include the following fields: ${fields}.`;
			}
		}

		const fullPrompt = `${formatInstruction}\n\n${params.prompt}`;

		const result = await this.model.generateContent(fullPrompt);
		const response = await result.response;
		const text = response.text();

		return this.parseJsonResponse(text, params);
	}

	private parseTextResponse(text: string): TextResult {
		const strippedText = this.stripMarkdown(text.trim());
		return { content: strippedText };
	}

	private parseJsonResponse<T extends z.ZodTypeAny>(
		text: string,
		params: JsonParams<T>,
	): JsonResult<T> {
		const cleanedText = text.replace(/^```json\n|```$/g, "").trim();
		try {
			const jsonContent = JSON.parse(cleanedText);
			const validatedContent = params.schema.parse(jsonContent);
			return { content: validatedContent, rawResponse: cleanedText };
		} catch (error) {
			log(`Error parsing JSON response: ${error}`);
			log("Attempted to parse:", cleanedText);
			throw new AppError("Failed to parse JSON response", {
				cause: error,
			});
		}
	}

	private stripMarkdown(text: string): string {
		return text
			.replace(/^#{1,6}\s+/gm, "")
			.replace(/\*\*(.*?)\*\*/g, "$1")
			.replace(/\*(.*?)\*/g, "$1")
			.replace(/\[(.*?)\]\(.*?\)/g, "$1")
			.replace(/^\s*[-*+]\s+/gm, "")
			.replace(/^\s*\d+\.\s+/gm, "")
			.replace(/`{1,3}[^`\n]+`{1,3}/g, "")
			.replace(/\n{2,}/g, "\n\n")
			.trim();
	}
}

export const aiUtility = new AIUtility();

export function generateAITextResponse(
	params: TextParams,
): Promise<TextResult> {
	return aiUtility.generateTextResponse(params);
}

export function generateAIJsonResponse<T extends z.ZodTypeAny>(
	params: JsonParams<T>,
): Promise<JsonResult<T>> {
	return aiUtility.generateJsonResponse(params);
}
