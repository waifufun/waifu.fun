CREATE TABLE "reconciliation_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"amount_bnb" numeric NOT NULL,
	"message" text NOT NULL,
	"signature" text NOT NULL,
	"snapshot_block" integer NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_registrations_address_unique" ON "reconciliation_registrations" USING btree ("address");--> statement-breakpoint
CREATE INDEX "reconciliation_registrations_registered_at_idx" ON "reconciliation_registrations" USING btree ("registered_at");