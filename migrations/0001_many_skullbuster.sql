CREATE TABLE "aws_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"access_key" text NOT NULL,
	"secret_key" text NOT NULL,
	"region" text DEFAULT 'us-east-1' NOT NULL,
	"is_sold" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"last_checked" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "aws_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"aws_account_id" integer NOT NULL,
	"event_time" timestamp NOT NULL,
	"event_name" text NOT NULL,
	"event_source" text NOT NULL,
	"ip_address" text NOT NULL,
	"location" text,
	"user_name" text,
	"user_agent" text,
	"details" jsonb
);
--> statement-breakpoint
ALTER TABLE "aws_activities" ADD CONSTRAINT "aws_activities_aws_account_id_aws_accounts_id_fk" FOREIGN KEY ("aws_account_id") REFERENCES "public"."aws_accounts"("id") ON DELETE no action ON UPDATE no action;