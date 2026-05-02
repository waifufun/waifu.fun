CREATE TABLE "agent_personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(128) NOT NULL,
	"token_address" varchar(66),
	"name" varchar(100) NOT NULL,
	"bio" text,
	"avatar_url" text,
	"preset" varchar(50),
	"system_prompt" text,
	"traits" jsonb DEFAULT '[]'::jsonb,
	"twitter_handle" varchar(30),
	"twitter_access_token" text,
	"twitter_access_secret" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_personas_agent_id_unique" UNIQUE("agent_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_personas_agent_id_unique" ON "agent_personas" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_personas_token_address" ON "agent_personas" USING btree ("token_address");--> statement-breakpoint
CREATE INDEX "idx_agent_personas_preset" ON "agent_personas" USING btree ("preset");