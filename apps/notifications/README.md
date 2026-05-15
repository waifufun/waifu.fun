# @waifufun/notifications

W46 launch lifecycle notifier. Polls `agent_launches` for state changes and
fans out Discord webhook + Telegram bot messages for:

- `round_opened` – launch first observed (vault state = open)
- `cap_hit` – `total_deposited >= presale_cap`
- `tranche_deployed` – tier-snapshot threshold crossed (T1/T2/T3/T4)
- `launched` – vault state transitioned to `launched`
- `summary_24h` – 24h post-launch recap

Idempotency lives in `launch_notifications` (unique on
`(launch_id, event_type, channel, dedupe_key)`). Subscribers (Discord webhook
URLs, Telegram chat IDs) live in `launch_notification_subscriptions`, one
row per (launch, channel).

## Run modes

- default: long-running poll loop, sleep `NOTIFICATIONS_POLL_INTERVAL_MS`
- `NOTIFICATIONS_RUN_ONCE=1`: single tick then exit
- `NOTIFICATIONS_DRY_RUN=1`: log payloads, never hit the network. Rows still
  recorded with `status = 'skipped'` so the dedupe index works.

## Env

| Var | Default | Notes |
| --- | --- | --- |
| `NOTIFICATIONS_POLL_INTERVAL_MS` | `15000` | sleep between ticks |
| `NOTIFICATIONS_RUN_ONCE` | – | one-shot mode |
| `NOTIFICATIONS_DRY_RUN` | – | skip outbound HTTP |
| `TELEGRAM_BOT_TOKEN` | – | shared platform bot |
| `WAIFU_FRONTEND_URL` | – | used to build launch links |
| `WAIFU_TRANCHE_BPS` | `2500,5000,7500,10000` | T1..T4 thresholds in BPS of presale cap |
