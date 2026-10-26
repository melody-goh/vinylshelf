-- pgvector, for the taste catalogue's embeddings (ADR 0008). The docker image, CI and
-- Neon all ship it; creating it needs a role allowed to, which those set up.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "catalogue_masters" (
	"id" integer PRIMARY KEY NOT NULL,
	"main_release_id" integer NOT NULL,
	"title" text NOT NULL,
	"artists" jsonb NOT NULL,
	"year" integer,
	"genres" jsonb NOT NULL,
	"styles" jsonb NOT NULL,
	"labels" jsonb NOT NULL,
	"country" text,
	"credits" jsonb NOT NULL,
	"versions" integer NOT NULL,
	"vinyl_versions" integer NOT NULL,
	"embedding" halfvec(384) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalogue_meta" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"manifest" jsonb NOT NULL,
	"loaded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "catalogue_meta_single_row" CHECK ("catalogue_meta"."id" = 1)
);
--> statement-breakpoint
CREATE INDEX "catalogue_masters_embedding_idx" ON "catalogue_masters" USING hnsw ("embedding" halfvec_cosine_ops);