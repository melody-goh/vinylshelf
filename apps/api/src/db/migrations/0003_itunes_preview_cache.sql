CREATE TABLE "itunes_preview_cache" (
	"discogs_id" integer PRIMARY KEY NOT NULL,
	"previews" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "itunes_preview_cache_ttl_max_24h" CHECK ("itunes_preview_cache"."expires_at" > "itunes_preview_cache"."fetched_at" and "itunes_preview_cache"."expires_at" <= "itunes_preview_cache"."fetched_at" + interval '24 hours')
);
--> statement-breakpoint
CREATE INDEX "itunes_preview_cache_expires_idx" ON "itunes_preview_cache" USING btree ("expires_at");