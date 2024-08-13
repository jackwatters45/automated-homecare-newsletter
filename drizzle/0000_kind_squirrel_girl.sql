DO $$ BEGIN
 CREATE TYPE "public"."cron_status" AS ENUM('SUCCESS', 'FAILURE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."status" AS ENUM('SENT', 'FAILED', 'DRAFT');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "automated-homecare-newsletter_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"link" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"newsletter_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "automated-homecare-newsletter_cron_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"execution_time" timestamp NOT NULL,
	"status" text NOT NULL,
	"message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "automated-homecare-newsletter_newsletter_recipients" (
	"newsletter_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "automated-homecare-newsletter_newsletter_recipients_newsletter_id_recipient_id_pk" PRIMARY KEY("newsletter_id","recipient_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "automated-homecare-newsletter_newsletters" (
	"id" serial PRIMARY KEY NOT NULL,
	"summary" text,
	"send_at" timestamp DEFAULT now(),
	"status" "status" DEFAULT 'DRAFT',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "automated-homecare-newsletter_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "automated-homecare-newsletter_articles" ADD CONSTRAINT "automated-homecare-newsletter_articles_newsletter_id_automated-homecare-newsletter_newsletters_id_fk" FOREIGN KEY ("newsletter_id") REFERENCES "public"."automated-homecare-newsletter_newsletters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "automated-homecare-newsletter_newsletter_recipients" ADD CONSTRAINT "automated-homecare-newsletter_newsletter_recipients_newsletter_id_automated-homecare-newsletter_newsletters_id_fk" FOREIGN KEY ("newsletter_id") REFERENCES "public"."automated-homecare-newsletter_newsletters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "automated-homecare-newsletter_newsletter_recipients" ADD CONSTRAINT "automated-homecare-newsletter_newsletter_recipients_recipient_id_automated-homecare-newsletter_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."automated-homecare-newsletter_recipients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
