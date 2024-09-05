import type {
	ads,
	articles,
	newsletters,
	recipients,
	reviewers,
} from "../db/schema.js";
import type { CATEGORIES } from "../lib/constants.js";

// Basic types
export type Category = (typeof CATEGORIES)[number];

// Scraping types
export interface PageToScrape {
	url: string;
	articleContainerSelector: string;
	linkSelector: string;
	titleSelector: string;
	descriptionSelector: string | undefined;
	dateSelector: string | undefined;
	removeIfNoDate?: boolean;
}

// Article types
interface TitleAndDescription {
	title: string;
	description: string;
}

export interface ArticleWithOptionalDescription {
	title: string;
	description?: string;
	link: string;
}

export interface BaseArticle extends TitleAndDescription {
	link: string;
}

export interface ArticleWithSnippet extends BaseArticle {
	snippet: string;
}

export interface ArticleData extends Partial<BaseArticle> {
	date?: Date | null;
}

export interface ArticleWithSource extends BaseArticle {
	source: string;
}

export interface ArticleWithOptionalSource extends BaseArticle {
	source?: string;
}

export interface RankedArticle
	extends Omit<ArticleWithSource, "link">,
		Omit<ArticleWithQuality, "link">,
		Omit<ArticleWithCount, "link"> {}

export interface ArticleFilteringData
	extends Omit<ArticleWithSourceAndCount, "link"> {}

export interface ArticleWithOptionalSourceAndCount
	extends ArticleWithOptionalSource {
	count: number;
}

export interface ArticleWithQuality extends BaseArticle {
	date?: Date;
	quality: number;
}

export interface ArticleWithCategories extends Omit<BaseArticle, "link"> {
	categories: Category[];
	quality: number;
}

export interface ArticleWithCount extends BaseArticle {
	count: number;
}

export interface ArticleWithSourceAndCount
	extends ArticleWithSource,
		ArticleWithCount {}

export interface ArticleWithQualityAndCategory extends ArticleWithQuality {
	category: Category;
}

export interface ArticleForCategorization
	extends Pick<ArticleWithQuality, "title" | "description" | "quality"> {}

export interface CategorizedArticle extends ArticleForCategorization {
	category: Category;
}

// Database types
export type Newsletter = typeof newsletters.$inferSelect;
export type NewNewsletter = typeof newsletters.$inferInsert;

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;

export type Recipient = typeof recipients.$inferSelect;
export type NewRecipient = typeof recipients.$inferInsert;

export type Reviewer = typeof reviewers.$inferSelect;
export type NewReviewer = typeof reviewers.$inferInsert;

export type Ad = typeof ads.$inferSelect;
export type NewAd = typeof ads.$inferInsert;

// Populated types
export interface PopulatedCategory {
	name: Category;
	articles: Article[];
}

export interface PopulatedNewsletter extends Newsletter {
	categories: PopulatedCategory[];
	ads: Ad[];
	recipients: Recipient[];
}

// Input types
export interface NewArticleInput extends BaseArticle {
	newsletterId: number;
	category: Category;
}

export interface CategoryInput {
	name: Category;
	articles: BaseArticle[];
}

export interface NewsletterInput {
	categories: CategoryInput[];
	summary: string;
}
