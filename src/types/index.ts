import type {
	articles,
	categories,
	newsletters,
	recipients,
} from "../db/schema.js";

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

export interface ArticleFilteringData {
	title: string;
	description?: string;
}

export interface ValidArticleDataWithCount extends ValidArticleData {
	count: number;
}

// Input types (pre-database)
export interface ArticleInput {
	title: string;
	link: string;
	description: string;
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

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;

export type Recipients = typeof recipients.$inferSelect;
export type NewRecipient = typeof recipients.$inferInsert;

// Populated types (post-database retrieval)
export type PopulatedNewCategory = NewCategory & {
	articles: NewArticle[];
};

export type PopulatedNewNewsletter = NewNewsletter & {
	categories: PopulatedNewCategory[];
};

export type PopulatedCategory = Category & {
	articles: Article[];
};

export type PopulatedNewsletter = Newsletter & {
	categories: PopulatedCategory[];
};
