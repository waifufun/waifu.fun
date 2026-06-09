DROP INDEX "credit_offramp_mints_active_deposit_unique";--> statement-breakpoint
WITH ranked_active AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "deposit_tx_hash"
			ORDER BY
				CASE "status"
					WHEN 'credited' THEN 0
					WHEN 'pending' THEN 1
					WHEN 'failed' THEN 2
					ELSE 3
				END,
				"updated_at" DESC,
				"created_at" DESC,
				"id" DESC
		) AS active_rank
	FROM "credit_offramp_mints"
	WHERE "status" IN ('pending', 'credited', 'failed')
)
UPDATE "credit_offramp_mints"
SET
	"status" = 'skipped',
	"reason" = CASE
		WHEN "reason" IS NULL OR "reason" = '' THEN 'deduped duplicate provider-attempt row before idempotency index tightening'
		ELSE "reason" || '; deduped duplicate provider-attempt row before idempotency index tightening'
	END,
	"updated_at" = now()
FROM ranked_active
WHERE "credit_offramp_mints"."id" = ranked_active."id"
	AND ranked_active.active_rank > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_offramp_mints_active_deposit_unique" ON "credit_offramp_mints" USING btree ("deposit_tx_hash") WHERE "credit_offramp_mints"."status" IN ('pending', 'credited', 'failed');
