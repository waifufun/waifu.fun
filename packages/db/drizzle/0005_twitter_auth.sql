-- Wave 1c: Twitter (X) OAuth — patron users + sessions
-- Run manually: psql $DATABASE_URL -f drizzle/0005_twitter_auth.sql

CREATE TABLE IF NOT EXISTS "patron_users" (
  "id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "x_user_id"       text        UNIQUE NOT NULL,
  "x_handle"        text        NOT NULL,
  "x_display_name"  text,
  "x_avatar_url"    text,
  "created_at"      timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"      timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patron_users_x_user_id" ON "patron_users" ("x_user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "patron_sessions" (
  "id"          text        PRIMARY KEY,
  "user_id"     uuid        NOT NULL REFERENCES "patron_users"("id") ON DELETE CASCADE,
  "expires_at"  timestamptz NOT NULL,
  "created_at"  timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patron_sessions_user_id"   ON "patron_sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patron_sessions_expires_at" ON "patron_sessions" ("expires_at");
