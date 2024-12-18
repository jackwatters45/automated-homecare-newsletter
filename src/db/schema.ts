import { relations } from "drizzle-orm";
import {
	integer,
	pgEnum,
	pgTableCreator,
	primaryKey,
	serial,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const createTable = pgTableCreator(
	(name) => `${process.env.APP_NAME}_${name}`,
);

export const statusEnum = pgEnum("status", ["SENT", "FAILED", "DRAFT"]);

export const newsletters = createTable("newsletters", {
	id: serial("id").primaryKey(),
	mailChimpId: text("mailchimp_id"),
	summary: text("summary"),
	sendAt: timestamp("send_at").defaultNow(),
	status: statusEnum("status").default("DRAFT"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

export const articles = createTable("articles", {
	id: serial("id").primaryKey(),
	title: text("title").notNull(),
	link: text("link").notNull(),
	description: text("description").notNull(),
	order: integer("order").notNull().default(0),
	category: text("category").notNull(),
	newsletterId: integer("newsletter_id")
		.notNull()
		.references(() => newsletters.id, {
			onDelete: "cascade",
			onUpdate: "cascade",
		}),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

export const articlesRelations = relations(articles, ({ one }) => ({
	newsletter: one(newsletters, {
		fields: [articles.newsletterId],
		references: [newsletters.id],
	}),
}));

export const newslettersRelations = relations(newsletters, ({ many }) => ({
	articles: many(articles),
	ads: many(adNewsletterRelations),
}));

export const reviewers = createTable("newsletter_reviewers", {
	id: serial("id").primaryKey(),
	email: text("email").notNull(),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

export const blacklistedEnum = pgEnum("blacklisted_type", [
	"INTERNAL",
	"EXTERNAL",
]);

export const blacklistedDomains = createTable("blacklisted_domains", {
	id: serial("id").primaryKey(),
	domain: text("domain").notNull(),
	type: blacklistedEnum("type").notNull().default("EXTERNAL"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

export const cronStatusEnum = pgEnum("cron_status", ["SUCCESS", "FAILURE"]);

export const cronLogs = createTable("cron_logs", {
	id: serial("id").primaryKey(),
	jobName: text("job_name").notNull(),
	executionTime: timestamp("execution_time").notNull(),
	status: text("status").notNull(),
	message: text("message"),
	createdAt: timestamp("created_at").defaultNow(),
});

export const settings = createTable("settings", {
	id: serial("id").primaryKey(),
	key: text("key").notNull().unique(),
	value: text("value").notNull(),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

export const adTypeEnum = pgEnum("ad_type", ["BANNER", "INLINE"]);

export const ads = createTable("ads", {
	id: serial("id").primaryKey(),
	title: text("title"),
	link: text("link").notNull(),
	imageUrl: text("imageUrl").notNull(),
	description: text("description"),
	order: integer("order").notNull().default(0),
	company: text("company").notNull(),
	type: adTypeEnum("type").notNull().default("INLINE"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

export const adNewsletterRelations = createTable("ad_newsletter_relations", {
	adId: integer("ad_id")
		.notNull()
		.references(() => ads.id, {
			onDelete: "cascade",
			onUpdate: "cascade",
		}),
	newsletterId: integer("newsletter_id")
		.notNull()
		.references(() => newsletters.id, {
			onDelete: "cascade",
			onUpdate: "cascade",
		}),
});

export const adsRelations = relations(ads, ({ many }) => ({
	newsletters: many(adNewsletterRelations),
}));

export const adNewsletterRelationsRelations = relations(
	adNewsletterRelations,
	({ one }) => ({
		ad: one(ads, {
			fields: [adNewsletterRelations.adId],
			references: [ads.id],
		}),
		newsletter: one(newsletters, {
			fields: [adNewsletterRelations.newsletterId],
			references: [newsletters.id],
		}),
	}),
);
