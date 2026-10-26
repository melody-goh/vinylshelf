CREATE TYPE "public"."taste_verdict" AS ENUM('more', 'less');--> statement-breakpoint
CREATE TABLE "taste_feedback" (
	"user_id" uuid NOT NULL,
	"master_id" integer NOT NULL,
	"verdict" "taste_verdict" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "taste_feedback_user_id_master_id_pk" PRIMARY KEY("user_id","master_id")
);
--> statement-breakpoint
ALTER TABLE "discogs_release_cache" ADD COLUMN "master_id" integer;--> statement-breakpoint
ALTER TABLE "taste_feedback" ADD CONSTRAINT "taste_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;