import OpenAI from "openai";

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY, // Make sure to set this environment variable
});

interface Article {
	url: string;
	content: string;
	relevanceScore?: number;
}

async function isRelevant(content: string, topic: string): Promise<boolean> {
	const response = await openai.chat.completions.create({
		model: "gpt-3.5-turbo",
		messages: [
			{
				role: "system",
				content:
					"You are an AI assistant that determines if an article is relevant to a given topic. Respond with only 'yes' or 'no'.",
			},
			{
				role: "user",
				content: `Topic: ${topic}\n\nArticle content: ${content}\n\nIs this article relevant to the topic?`,
			},
		],
		max_tokens: 1,
	});

	return response.choices[0].message.content?.toLowerCase() === "yes";
}

async function rankArticle(content: string, topic: string): Promise<number> {
	const response = await openai.chat.completions.create({
		model: "gpt-3.5-turbo",
		messages: [
			{
				role: "system",
				content:
					"You are an AI assistant that ranks articles based on their relevance and quality in relation to a given topic. Provide a score from 0 to 10, where 10 is the most relevant and highest quality.",
			},
			{
				role: "user",
				content: `Topic: ${topic}\n\nArticle content: ${content}\n\nPlease provide a relevance and quality score for this article.`,
			},
		],
		max_tokens: 1,
	});

	return Number.parseInt(response.choices[0].message.content || "0");
}

async function analyzeAndRankArticles(
	articles: Article[],
	topic: string,
	numTopArticles = 10,
): Promise<Article[]> {
	const rankedArticles = await Promise.all(
		articles.map(async (article) => ({
			...article,
			relevanceScore: await rankArticle(article.content, topic),
		})),
	);

	return rankedArticles
		.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
		.slice(0, numTopArticles);
}
