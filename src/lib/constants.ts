import path from "node:path";
import type { PageToScrape } from "../types/index.js";

export const TEST_PAGES: PageToScrape[] = [
	{
		url: "https://pqhh.org/media-center/",
		articleContainerSelector: ".fl-post-text",
		linkSelector: ".fl-post-title > a",
		titleSelector: ".fl-post-title",
		descriptionSelector: undefined,
		dateSelector: ".fl-post-meta",
	},
];

export const SPECIFIC_PAGES: PageToScrape[] = [
	{
		url: "https://pqhh.org/media-center/",
		articleContainerSelector: ".fl-post-text",
		linkSelector: ".fl-post-title > a",
		titleSelector: ".fl-post-title",
		descriptionSelector: undefined,
		dateSelector: ".fl-post-meta",
	},
	{
		url: "https://www.mcknightshomecare.com/home/news/",
		articleContainerSelector: ".article-teaser",
		linkSelector: "a",
		titleSelector: ".card-title",
		descriptionSelector: ".card-text",
		dateSelector: ".post-date",
	},
	{
		url: "https://valleyhca.com/our-blog/",
		articleContainerSelector: "article",
		linkSelector: "a",
		titleSelector: ".tpn-postheader",
		descriptionSelector: "p",
		dateSelector: ".entry-date",
	},
	{
		url: "https://www.medicalnewstoday.com/news",
		articleContainerSelector: ".css-kbq0t",
		linkSelector: "a",
		titleSelector: "h2",
		descriptionSelector: "p",
		dateSelector: ".css-3be604",
	},
	{
		url: "https://dailycaring.com/",
		articleContainerSelector: "article",
		linkSelector: "a",
		titleSelector: "h2",
		descriptionSelector: "p",
		dateSelector: undefined,
	},
	{
		url: "https://www.casacompanionhomecare.com/blog/",
		articleContainerSelector: ".fl-post-grid-post",
		linkSelector: "a",
		titleSelector: "h2",
		descriptionSelector: "p",
		dateSelector: undefined,
	},
];

export const TOPIC = "homecare (medical) and home health (medical)";

export const DESCRIPTION_MAX_LENGTH = 35;

export const COMPANY_NAME = "TrollyCare";

export const PORT = process.env.PORT || 8080;

export const CLIENT_PORT = process.env.CLIENT_PORT || 5173;

export const IS_DEVELOPMENT = process.env.NODE_ENV === "development";

export const API_URL = IS_DEVELOPMENT
	? `http://localhost:${PORT}`
	: "automated-homecare-newsletter-production.up.railway.app";

export const CLIENT_URL = IS_DEVELOPMENT
	? `http://localhost:${CLIENT_PORT}`
	: "https://trollycare-newsletter.vercel.app";

export const BASE_PATH = path.resolve();

export const CATEGORIES = [
	"Policy & Industry Trends",
	"Clinical Advancements & Best Practices",
	"Technology & Innovation",
	"Business Operations & Finance",
	"Workforce & Professional Development",
	"Patient Care & Community Health",
	// "Business Operations & Technology",
	// "Caregiving Excellence: Support & Best Practices",
	"Other",
] as const;

export const SYSTEM_INSTRUCTION = `You are a homecare business operator. You are an expert in homecare news and are tasked with choosing which articles to include in a newsletter as well as generating a summary for the newsletter and cleaning up the content of the articles.
	\n\n
	Please provide your response in valid JSON format. The entire response should be a single JSON object or array. Do not include any explanatory text outside of the JSON structure.
	`;

export const INITIAL_FETCH_COUNT = 40;
export const MAX_NUMBER_OF_ARTICLES = 30;
export const MIN_NUMBER_OF_ARTICLES = MAX_NUMBER_OF_ARTICLES - 5;
export const MAX_ARTICLES_PER_SOURCE = 5;
export const MAX_RETRIES = 3;

export const CACHE_KEY = "articleData";
