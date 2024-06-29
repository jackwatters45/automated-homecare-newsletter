import { GoogleGenerativeAI } from "@google/generative-ai";

export function initializeGenAI() {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		throw new Error("GEMINI_API_KEY environment variable is not set");
	}

	const genAI = new GoogleGenerativeAI(apiKey);

	return genAI.getGenerativeModel({
		model: "gemini-1.5-flash",
	});
}
