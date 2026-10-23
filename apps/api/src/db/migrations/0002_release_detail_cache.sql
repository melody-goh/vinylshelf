CREATE TABLE "discogs_release_detail_cache" (
	"discogs_id" integer PRIMARY KEY NOT NULL,
	"detail" jsonb NOT NULL,
	"classification" "discogs_classification" NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discogs_release_detail_cache_ttl_max_6h" CHECK ("discogs_release_detail_cache"."expires_at" > "discogs_release_detail_cache"."fetched_at" and "discogs_release_detail_cache"."expires_at" <= "discogs_release_detail_cache"."fetched_at" + interval '6 hours')
);
--> statement-breakpoint
CREATE INDEX "discogs_release_detail_cache_expires_idx" ON "discogs_release_detail_cache" USING btree ("expires_at");