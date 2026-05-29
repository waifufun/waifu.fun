DROP INDEX "launch_claims_tx_log_unique";--> statement-breakpoint
DROP INDEX "launch_deposits_tx_log_unique";--> statement-breakpoint
DROP INDEX "launch_withdrawals_tx_log_unique";--> statement-breakpoint
ALTER TABLE "launch_claims" ADD COLUMN "block_hash" varchar(66) DEFAULT '0x0000000000000000000000000000000000000000000000000000000000000000' NOT NULL;--> statement-breakpoint
ALTER TABLE "launch_deposits" ADD COLUMN "block_hash" varchar(66) DEFAULT '0x0000000000000000000000000000000000000000000000000000000000000000' NOT NULL;--> statement-breakpoint
ALTER TABLE "launch_withdrawals" ADD COLUMN "block_hash" varchar(66) DEFAULT '0x0000000000000000000000000000000000000000000000000000000000000000' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "launch_claims_tx_log_unique" ON "launch_claims" USING btree ("tx_hash","log_index","block_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "launch_deposits_tx_log_unique" ON "launch_deposits" USING btree ("tx_hash","log_index","block_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "launch_withdrawals_tx_log_unique" ON "launch_withdrawals" USING btree ("tx_hash","log_index","block_hash");