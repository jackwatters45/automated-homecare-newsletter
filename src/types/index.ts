import type { articles, newsletters, recipients } from "../db/schema.js";
import type { CATEGORIES } from "../lib/constants.js";

// Data collection + formatting types
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
	link?: string | null;
	title?: string | null;
	description?: string | null;
	date?: Date | null;
	snippet?: string | null;
}

export interface ValidArticleData {
	link: string;
	title: string;
	description?: string;
	date?: Date;
	snippet?: string;
}

export interface ArticleFilteringData {
	title: string;
	description?: string;
}

export interface ValidArticleDataWithCount extends ValidArticleData {
	count: number;
}

export type Category = (typeof CATEGORIES)[number];

// Input types (pre-database)
export interface ArticleInput {
	title: string;
	link: string;
	description: string;
}

export interface NewArticleInput extends Omit<ArticleInput, "description"> {
	description?: string;
	newsletterId: number;
	category: Category;
}

export interface ArticleInputWithCategory extends ArticleInput {
	category: Category;
}

export interface CategoryInput {
	name: string;
	articles: ArticleInput[];
}

export interface NewsletterInput {
	categories: CategoryInput[];
	summary: string;
}

// Database types
export type Newsletter = typeof newsletters.$inferSelect;
export type NewNewsletter = typeof newsletters.$inferInsert;

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;

export type Recipients = typeof recipients.$inferSelect;
export type NewRecipient = typeof recipients.$inferInsert;

// Populated types (post-database retrieval)
export type ArticleWithCategory = Article & {
	category: string;
};

export type PopulatedCategory = {
	name: Category;
	articles: Article[];
};

export type PopulatedNewsletter = Newsletter & {
	categories: PopulatedCategory[];
	recipients: Recipients[];
};
