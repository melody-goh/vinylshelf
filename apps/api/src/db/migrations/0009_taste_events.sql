CREATE TYPE "public"."taste_distance" AS ENUM('near', 'far');--> statement-breakpoint
CREATE TYPE "public"."taste_event_kind" AS ENUM('viewed', 'previewed', 'opened', 'wanted', 'more', 'less', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."taste_surface" AS ENUM('discover', 'search');--> statement-breakpoint
CREATE TABLE "taste_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "taste_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"list_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "taste_event_kind" NOT NULL,
	"master_id" integer NOT NULL,
	"position" smallint NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taste_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"surface" "taste_surface" NOT NULL,
	"distance" "taste_distance",
	"query" text,
	"page" smallint DEFAULT 0 NOT NULL,
	"picks" jsonb NOT NULL,
	"served_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "taste_events" ADD CONSTRAINT "taste_events_list_id_taste_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."taste_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taste_events" ADD CONSTRAINT "taste_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taste_lists" ADD CONSTRAINT "taste_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "taste_events_list_idx" ON "taste_events" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "taste_events_user_at_idx" ON "taste_events" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "taste_lists_user_served_idx" ON "taste_lists" USING btree ("user_id","served_at");