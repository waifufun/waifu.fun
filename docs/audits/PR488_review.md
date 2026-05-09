The new signer-backed launch creation endpoint is exposed without authorization, which can directly cost the service gas and allow arbitrary launches. The depositor aggregate helper also silently truncates results, producing incorrect API responses for larger launches.

Full review comments:

- [P1] Require authorization before broadcasting launches — /home/shad0w/projects/waifu.fun-wt/codex-retro-review/apps/api/src/routes/v2/agent-launches.ts:169-172
  When `LAUNCH_FACTORY_SIGNER_PK` is configured, this public POST handler lets any unauthenticated caller submit arbitrary launch parameters and makes the API signer pay gas for `createLaunch`. Because the route only parses the body and resolves the signer-backed service, a malicious caller can drain the gas wallet or create launches for someone else's `creator` address; require patron/wallet ownership (or equivalent authorization) before calling `createLaunchOnchain`.

- [P2] Avoid truncating depositor aggregates — /home/shad0w/projects/waifu.fun-wt/codex-retro-review/apps/api/src/services/launch-v2/launch-repo.ts:151-152
  For launches with more than 1000 distinct depositors, this hard limit makes `GET /:id/depositors` return an incomplete list and count, despite the route exposing a full depositor list. The same capped helper is also used for per-address fallback aggregation, so users outside the first 1000 can be reported as having zero indexed deposits when RPC enrichment is unavailable; add pagination for the list endpoint and use an uncapped targeted query for single-address lookups.
