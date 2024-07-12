import type { generateNewsletterData } from "../app/index.js";

export interface PageToScrape {
	url: string;
	articleContainerSelector: string;
	linkSelector: string;
	titleSelector: string;
	descriptionSelector: string | undefined;
	dateSelector: string | undefined;
	removeIfNoDate?: boolean;
}

export interface ArticleData {
	link?: string;
	title?: string;
	description?: string;
	date?: Date;
	snippet?: string;
}

export interface ValidArticleData {
	link: string;
	title: string;
	description?: string;
	date?: Date;
	snippet?: string;
}

export interface ArticleDisplayData {
	title: string;
	link: string;
	description: string;
}

export interface ArticleFilteringData {
	title: string;
	description?: string;
}

export interface ValidArticleDataWithCount extends ValidArticleData {
	count: number;
}

export type NewsletterData = Awaited<ReturnType<typeof generateNewsletterData>>;

export interface Category {
	name: string;
	articles: ArticleDisplayData[];
}
