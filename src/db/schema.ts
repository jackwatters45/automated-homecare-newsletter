import { relations } from "drizzle-orm";
import {
	integer,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const newsletters = pgTable("newsletters", {
	id: serial("id").primaryKey(),
	summary: text("summary"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

export const categories = pgTable(
	"categories",
	{
		id: serial("id").primaryKey(),
		name: text("name").notNull(),
		newsletterId: integer("newsletter_id")
			.notNull()
			.references(() => newsletters.id),
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(table) => {
		return {
			nameNewsletterIdx: uniqueIndex("name_newsletter_idx").on(
				table.name,
				table.newsletterId,
			),
		};
	},
);

export const articles = pgTable("articles", {
	id: serial("id").primaryKey(),
	title: text("title").notNull(),
	link: text("link").notNull(),
	description: text("description").notNull(),
	categoryId: integer("category_id")
		.notNull()
		.references(() => categories.id),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

export const newslettersRelations = relations(newsletters, ({ many }) => ({
	categories: many(categories),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
	newsletter: one(newsletters, {
		fields: [categories.newsletterId],
		references: [newsletters.id],
	}),
	articles: many(articles),
}));

export const articlesRelations = relations(articles, ({ one }) => ({
	category: one(categories, {
		fields: [articles.categoryId],
		references: [categories.id],
	}),
}));
