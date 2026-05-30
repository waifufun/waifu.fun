DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM (SELECT 1 FROM "launch_claims" GROUP BY "tx_hash", "log_index" HAVING count(*) > 1) duplicates) THEN
		RAISE EXCEPTION 'duplicate launch_claims tx_hash/log_index rows exist; repair aggregates before applying 0040_vault_reorg_idempotency';
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM (SELECT 1 FROM "launch_deposits" GROUP BY "tx_hash", "log_index" HAVING count(*) > 1) duplicates) THEN
		RAISE EXCEPTION 'duplicate launch_deposits tx_hash/log_index rows exist; repair aggregates before applying 0040_vault_reorg_idempotency';
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM (SELECT 1 FROM "launch_withdrawals" GROUP BY "tx_hash", "log_index" HAVING count(*) > 1) duplicates) THEN
		RAISE EXCEPTION 'duplicate launch_withdrawals tx_hash/log_index rows exist; repair aggregates before applying 0040_vault_reorg_idempotency';
	END IF;
END $$;--> statement-breakpoint
DROP INDEX "launch_claims_tx_log_unique";--> statement-breakpoint
DROP INDEX "launch_deposits_tx_log_unique";--> statement-breakpoint
DROP INDEX "launch_withdrawals_tx_log_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "launch_claims_tx_log_unique" ON "launch_claims" USING btree ("tx_hash","log_index");--> statement-breakpoint
CREATE UNIQUE INDEX "launch_deposits_tx_log_unique" ON "launch_deposits" USING btree ("tx_hash","log_index");--> statement-breakpoint
CREATE UNIQUE INDEX "launch_withdrawals_tx_log_unique" ON "launch_withdrawals" USING btree ("tx_hash","log_index");
