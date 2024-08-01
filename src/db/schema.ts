import { relations } from "drizzle-orm";
import {
	integer,
	pgEnum,
	pgTable,
	pgTableCreator,
	primaryKey,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const createTable = pgTableCreator(
	(name) => `${process.env.APP_NAME}_${name}`,
);

export const statusEnum = pgEnum("status", ["SENT", "FAILED", "DRAFT"]);

export const newsletters = pgTable("newsletters", {
	id: serial("id").primaryKey(),
	summary: text("summary"),
	sendAt: timestamp("send_at").defaultNow(),
	status: statusEnum("status").default("DRAFT"),
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

export const recipients = pgTable("recipients", {
	id: serial("id").primaryKey(),
	email: text("email").notNull(),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

export const newsletterRecipients = pgTable(
	"newsletter_recipients",
	{
		newsletterId: integer("newsletter_id")
			.notNull()
			.references(() => newsletters.id),
		recipientId: integer("recipient_id")
			.notNull()
			.references(() => recipients.id),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.newsletterId, table.recipientId] }),
	}),
);

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

// New relations for newsletters and recipients
export const newslettersRelations = relations(newsletters, ({ many }) => ({
	categories: many(categories),
	recipients: many(newsletterRecipients),
}));

export const recipientsRelations = relations(recipients, ({ many }) => ({
	newsletters: many(newsletterRecipients),
}));

export const newsletterRecipientsRelations = relations(
	newsletterRecipients,
	({ one }) => ({
		newsletter: one(newsletters, {
			fields: [newsletterRecipients.newsletterId],
			references: [newsletters.id],
		}),
		recipient: one(recipients, {
			fields: [newsletterRecipients.recipientId],
			references: [recipients.id],
		}),
	}),
);

export const cronStatusEnum = pgEnum("cron_status", ["SUCCESS", "FAILURE"]);
export const cronLogs = pgTable("cron_logs", {
	id: serial("id").primaryKey(),
	jobName: text("job_name").notNull(),
	executionTime: timestamp("execution_time").notNull(),
	status: text("status").notNull(),
	message: text("message"),
	createdAt: timestamp("created_at").defaultNow(),
});

export const cronLogsRelations = relations(cronLogs, ({ many }) => ({}));
