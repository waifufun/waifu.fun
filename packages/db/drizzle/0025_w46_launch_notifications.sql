-- W46: Launch lifecycle notifications.
-- Tables: launch_notifications (audit + idempotency), launch_notification_subscriptions (per-launch targets).

CREATE TABLE IF NOT EXISTS "launch_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "launch_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "channel" text NOT NULL,
  "webhook_url" text,
  "dedupe_key" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'sent',
  "status_code" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error_message" text,
  "sent_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "launch_notifications" ADD CONSTRAINT "launch_notifications_launch_id_agent_launches_id_fk"
    FOREIGN KEY ("launch_id") REFERENCES "public"."agent_launches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "launch_notifications_dedupe" ON "launch_notifications" USING btree ("launch_id", "event_type", "channel", "dedupe_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_launch_notifications_launch" ON "launch_notifications" USING btree ("launch_id", "sent_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_launch_notifications_event" ON "launch_notifications" USING btree ("event_type");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "launch_notification_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "launch_id" uuid NOT NULL,
  "channel" text NOT NULL,
  "target" text NOT NULL,
  "bot_token" varchar(256),
  "event_filter" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" varchar(42),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "launch_notification_subscriptions" ADD CONSTRAINT "launch_notification_subs_launch_id_agent_launches_id_fk"
    FOREIGN KEY ("launch_id") REFERENCES "public"."agent_launches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "launch_notification_subs_dedupe" ON "launch_notification_subscriptions" USING btree ("launch_id", "channel");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_launch_notification_subs_launch" ON "launch_notification_subscriptions" USING btree ("launch_id");
