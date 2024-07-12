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
		url: "https://homehealthcarenews.com/",
		articleContainerSelector: ".entry-block",
		linkSelector: "h2 > a",
		titleSelector: ".entry-title",
		descriptionSelector: undefined,
		dateSelector: ".entry-date",
		removeIfNoDate: true,
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
		url: "https://nahc.org/nahc-newsroom/",
		articleContainerSelector: ".news-info",
		linkSelector: ".read-more",
		titleSelector: ".h4",
		descriptionSelector: undefined,
		dateSelector: ".date",
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
	// {
	// 	url: "https://www.healthcarefinancenews.com/news",
	// 	articleContainerSelector: ".views-row",
	// 	linkSelector: "a",
	// 	titleSelector: ".field-content > a",
	// 	descriptionSelector: ".teaser",
	// 	dateSelector: undefined,
	// },
];

export const TOPIC = "homecare (medical) and home health (medical)";

export const RECURRING_FREQUENCY = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export const DESCRIPTION_MAX_LENGTH = 35;

export const COMPANY_NAME = "TrollyCare";

export const PORT = process.env.PORT || 8080;

export const API_URL =
	process.env.NODE_ENV === "production"
		? "automated-homecare-newsletter-production.up.railway.app"
		: `http://localhost:${PORT}`;

export const BASE_PATH = path.resolve();

export const CATEGORIES = [
	"Industry Trends & Policy",
	"Clinical Research & Care Innovations",
	"Business Operations & Technology",
	"Caregiver Support & Resources",
	"Patient Care & Caregiving Best Practices",
	"Other",
];

// - Industry trends & news
// - Caregiving & Family Support

// - Senior Care Tips & Resources
// - In-Home Care Services & Solutions
