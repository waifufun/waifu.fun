ALTER TABLE "creators" ADD COLUMN IF NOT EXISTS "steward_user_id" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "creators" ADD CONSTRAINT "creators_steward_user_id_unique" UNIQUE("steward_user_id");
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creators_steward_user" ON "creators" USING btree ("steward_user_id") WHERE "steward_user_id" is not null;
