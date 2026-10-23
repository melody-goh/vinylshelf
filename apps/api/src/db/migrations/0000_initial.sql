CREATE TYPE "public"."discogs_classification" AS ENUM('cc0', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "collection_items" (
	"user_id" uuid NOT NULL,
	"instance_id" bigint NOT NULL,
	"release_id" integer NOT NULL,
	"date_added" timestamp with time zone NOT NULL,
	"last_seen_import_id" uuid,
	CONSTRAINT "collection_items_user_id_instance_id_pk" PRIMARY KEY("user_id","instance_id")
);
--> statement-breakpoint
CREATE TABLE "discogs_release_cache" (
	"discogs_id" integer PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artists" jsonb NOT NULL,
	"artist_sort" text NOT NULL,
	"year" integer,
	"cover_image_url" text,
	"discogs_url" text NOT NULL,
	"classification" "discogs_classification" NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discogs_release_cache_ttl_max_6h" CHECK ("discogs_release_cache"."expires_at" > "discogs_release_cache"."fetched_at" and "discogs_release_cache"."expires_at" <= "discogs_release_cache"."fetched_at" + interval '6 hours')
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "import_status" DEFAULT 'queued' NOT NULL,
	"cursor_page" integer DEFAULT 1 NOT NULL,
	"fetched" integer DEFAULT 0 NOT NULL,
	"total" integer,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "import_jobs_cursor_page_positive" CHECK ("import_jobs"."cursor_page" >= 1),
	CONSTRAINT "import_jobs_fetched_non_negative" CHECK ("import_jobs"."fetched" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discogs_user_id" integer NOT NULL,
	"discogs_username" text NOT NULL,
	"oauth_token_enc" text NOT NULL,
	"oauth_secret_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_discogs_user_id_unique" UNIQUE("discogs_user_id")
);
--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_last_seen_import_id_import_jobs_id_fk" FOREIGN KEY ("last_seen_import_id") REFERENCES "public"."import_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_items_user_added_idx" ON "collection_items" USING btree ("user_id","date_added","instance_id");--> statement-breakpoint
CREATE INDEX "collection_items_release_idx" ON "collection_items" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "discogs_release_cache_expires_idx" ON "discogs_release_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "import_jobs_one_active_per_user" ON "import_jobs" USING btree ("user_id") WHERE "import_jobs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "import_jobs_user_created_idx" ON "import_jobs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");