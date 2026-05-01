# Migration history notes

## Parallel-branch numbering cleanup (W5.0)

Waves 1-4 shipped several database migrations from isolated worktrees at the same time. Those branches used Drizzle-generated filenames with overlapping numeric prefixes (`0008_*`, `0009_*`, `0010_*`) and were merged successfully, but `meta/_journal.json` only tracked migrations through `0004_eminent_bishop`.

W5.0 consolidates the journal by appending the existing SQL migration files in their intended filename order:

1. `0005_twitter_auth`
2. `0006_agent_auth`
3. `0007_claim_flow`
4. `0008_agent_events_canonical`
5. `0008_agent_pause_controls`
6. `0008_agent_x_accounts`
7. `0008_launch_tax_split`
8. `0009_agent_safes`
9. `0009_webhook_inbox`
10. `0010_agent_adapter_policies`
11. `0010_graceful_shutdown`

The Drizzle snapshot files under `meta/` were intentionally left unchanged. They remain Drizzle's authoritative state snapshots; this document records the merge-history gap rather than rewriting generated state.

## Lesson for future migrations

When multiple branches add migrations in parallel, reconcile the Drizzle journal before merge or immediately after the first integration pass. Prefer one branch to regenerate/rebase migration numbering once the other migrations land, and verify `_journal.json` includes every committed SQL file before deploying.

## W6.2 launches lifecycle

Adds the idempotent `0011_launches_authorize` migration for v3 launch lifecycle fields:
`agent_id`, `creator_address`, `tax_recipient_address`, `first_buy_wei`,
`launch_authorized_at`, and `launch_authorized_by`. Launch status values remain
application-level text constants so future lifecycle pivots do not require a DB enum rewrite.
