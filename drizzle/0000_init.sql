CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."claim_source" AS ENUM('API', 'MANUAL_INPUT');--> statement-breakpoint
CREATE TYPE "public"."class_source" AS ENUM('AI', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('NEW', 'STATUS_CHANGED', 'REG_NO_ASSIGNED');--> statement-breakpoint
CREATE TYPE "public"."family" AS ENUM('NO96', 'MK3', 'FLEX', 'SLIM', 'GST', 'ETC', 'UNCLASSIFIED');--> statement-breakpoint
CREATE TYPE "public"."layer" AS ENUM('L1', 'L2', 'L3', 'L4', 'UNCLASSIFIED');--> statement-breakpoint
CREATE TYPE "public"."risk" AS ENUM('HIGH', 'MID', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."run_state" AS ENUM('RUNNING', 'DONE', 'FAILED', 'PARTIAL');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('CRON', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."status_group" AS ENUM('valid', 'pending', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."verified" AS ENUM('API', 'WEB', 'UNVERIFIED');--> statement-breakpoint
CREATE TABLE "applicant_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_hit_count" integer,
	"note" text,
	CONSTRAINT "applicant_aliases_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "claim_charts" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_no" text NOT NULL,
	"claim_no" integer NOT NULL,
	"other_independent" integer[],
	"elements" jsonb NOT NULL,
	"element_count" integer NOT NULL,
	"key_limiting" text,
	"review_ideas" text,
	"claim_source" "claim_source" NOT NULL,
	"model" text,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_no" text NOT NULL,
	"family" "family" NOT NULL,
	"layer" "layer" NOT NULL,
	"evidence" jsonb,
	"confidence" numeric(3, 2),
	"model" text,
	"prompt_version" text,
	"source" "class_source" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitor_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"app_no" text NOT NULL,
	"type" "event_type" NOT NULL,
	"before" text,
	"after" text,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitor_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"trigger" "run_trigger" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"state" "run_state" DEFAULT 'RUNNING' NOT NULL,
	"cursor" jsonb,
	"stats" jsonb,
	"api_calls" integer DEFAULT 0 NOT NULL,
	"error" text,
	"report_md" text
);
--> statement-breakpoint
CREATE TABLE "patent_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_no" text NOT NULL,
	"run_id" integer,
	"field" text NOT NULL,
	"before" text,
	"after" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patents" (
	"app_no" text PRIMARY KEY NOT NULL,
	"app_date" date,
	"title" text NOT NULL,
	"applicant" text,
	"ipc" text[],
	"pub_no" text,
	"pub_date" date,
	"reg_no" text,
	"reg_date" date,
	"status" text,
	"status_group" "status_group",
	"abstract" text,
	"family" "family" DEFAULT 'UNCLASSIFIED' NOT NULL,
	"layer" "layer" DEFAULT 'UNCLASSIFIED' NOT NULL,
	"risk" "risk",
	"risk_provisional" boolean DEFAULT true NOT NULL,
	"verified" "verified" DEFAULT 'UNVERIFIED' NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked" timestamp with time zone,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_charts" ADD CONSTRAINT "claim_charts_app_no_patents_app_no_fk" FOREIGN KEY ("app_no") REFERENCES "public"."patents"("app_no") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classifications" ADD CONSTRAINT "classifications_app_no_patents_app_no_fk" FOREIGN KEY ("app_no") REFERENCES "public"."patents"("app_no") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_events" ADD CONSTRAINT "monitor_events_run_id_monitor_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."monitor_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_events" ADD CONSTRAINT "monitor_events_app_no_patents_app_no_fk" FOREIGN KEY ("app_no") REFERENCES "public"."patents"("app_no") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patent_status_history" ADD CONSTRAINT "patent_status_history_app_no_patents_app_no_fk" FOREIGN KEY ("app_no") REFERENCES "public"."patents"("app_no") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patent_status_history" ADD CONSTRAINT "patent_status_history_run_id_monitor_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."monitor_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patents_status_risk_idx" ON "patents" USING btree ("status_group","risk");--> statement-breakpoint
CREATE INDEX "patents_family_layer_idx" ON "patents" USING btree ("family","layer");--> statement-breakpoint
CREATE INDEX "patents_app_date_idx" ON "patents" USING btree ("app_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "patents_title_trgm_idx" ON "patents" USING gin ("title" gin_trgm_ops);