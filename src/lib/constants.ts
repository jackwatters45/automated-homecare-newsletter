import path from "node:path";
import type { PageToScrape } from "../types/index.js";

export const TEST_PAGES: PageToScrape[] = [
	{
		url: "https://pqhh.org/media-center/",
		type: "server",
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
		type: "server",
		articleContainerSelector: ".fl-post-text",
		linkSelector: ".fl-post-title > a",
		titleSelector: ".fl-post-title",
		descriptionSelector: undefined,
		dateSelector: ".fl-post-meta",
	},
	{
		url: "https://www.homecaremag.com/news",
		type: "client",
		articleContainerSelector: "article",
		linkSelector: "a",
		titleSelector: ".field-node--node-title",
		descriptionSelector: ".field-node--field-subhead",
		dateSelector: undefined,
	},
	{
		url: "https://www.mcknightshomecare.com/home/news/",
		type: "client",
		articleContainerSelector: ".article-teaser",
		linkSelector: "a",
		titleSelector: ".card-title",
		descriptionSelector: ".card-text",
		dateSelector: ".post-date",
	},
	{
		url: "https://homehealthcarenews.com/",
		type: "server",
		articleContainerSelector: ".entry-block",
		linkSelector: "h2 > a",
		titleSelector: ".entry-title",
		descriptionSelector: undefined,
		dateSelector: ".entry-date",
		removeIfNoDate: true,
	},
	{
		url: "https://hospicenews.com/",
		type: "server",
		articleContainerSelector: ".entry-block",
		linkSelector: "h2 > a",
		titleSelector: ".entry-title",
		descriptionSelector: undefined,
		dateSelector: ".entry-date",
		removeIfNoDate: true,
	},
	{
		url: "https://valleyhca.com/our-blog/",
		type: "server",
		articleContainerSelector: "article",
		linkSelector: "a",
		titleSelector: ".tpn-postheader",
		descriptionSelector: "p",
		dateSelector: ".entry-date",
	},
	{
		url: "https://www.medicalnewstoday.com/news",
		type: "server",
		articleContainerSelector: ".css-kbq0t",
		linkSelector: "a",
		titleSelector: "h2",
		descriptionSelector: "p",
		dateSelector: ".css-3be604",
	},
	{
		url: "https://nahc.org/nahc-newsroom/",
		type: "server",
		articleContainerSelector: ".news-info",
		linkSelector: ".read-more",
		titleSelector: ".h4",
		descriptionSelector: undefined,
		dateSelector: ".date",
	},
	{
		url: "https://dailycaring.com/",
		type: "server",
		articleContainerSelector: "article",
		linkSelector: "a",
		titleSelector: "h2",
		descriptionSelector: "p",
		dateSelector: undefined,
	},
	{
		url: "https://www.casacompanionhomecare.com/blog/",
		type: "server",
		articleContainerSelector: ".fl-post-grid-post",
		linkSelector: "a",
		titleSelector: "h2",
		descriptionSelector: "p",
		dateSelector: undefined,
	},
	{
		url: "https://www.healthcarefinancenews.com/news",
		type: "server",
		articleContainerSelector: ".views-row",
		linkSelector: "a",
		titleSelector: ".field-content > a",
		descriptionSelector: ".teaser",
		dateSelector: undefined,
	},
];

export const RECURRING_FREQUENCY = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export const DESCRIPTION_MAX_LENGTH = 25;

export const PORT = process.env.PORT || 8080;

export const API_URL =
	process.env.NODE_ENV === "production"
		? "automated-homecare-newsletter-production.up.railway.app"
		: `http://localhost:${PORT}`;

export const BASE_PATH = path.resolve();
