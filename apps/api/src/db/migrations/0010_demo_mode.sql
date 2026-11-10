CREATE SEQUENCE "public"."demo_user_ids" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "demo_collection" (
	"user_id" uuid NOT NULL,
	"instance_id" integer NOT NULL,
	"release_id" integer NOT NULL,
	"date_added" timestamp with time zone NOT NULL,
	CONSTRAINT "demo_collection_user_id_instance_id_pk" PRIMARY KEY("user_id","instance_id")
);
--> statement-breakpoint
CREATE TABLE "demo_wants" (
	"user_id" uuid NOT NULL,
	"release_id" integer NOT NULL,
	"date_added" timestamp with time zone NOT NULL,
	CONSTRAINT "demo_wants_user_id_release_id_pk" PRIMARY KEY("user_id","release_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "demo_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "demo_collection" ADD CONSTRAINT "demo_collection_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_wants" ADD CONSTRAINT "demo_wants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_demo_expires_at_idx" ON "users" USING btree ("demo_expires_at");