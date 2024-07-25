import { GoogleGenerativeAI } from "@google/generative-ai";
import logger from "./logger.js";

export function initializeGenAI() {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		logger.error("GEMINI_API_KEY environment variable is not set", {
			apiKey,
		});
		throw new Error("GEMINI_API_KEY environment variable is not set");
	}

	const genAI = new GoogleGenerativeAI(apiKey);

	return genAI.getGenerativeModel({
		model: "gemini-1.5-flash",
		systemInstruction:
			"You are a homecare business operator. You an expeert in homecare news and are tasked with choosing which articles to include in a newsletter as well as generating a summary for the newsletter and cleaning up the content of the articles.",
	});
}
