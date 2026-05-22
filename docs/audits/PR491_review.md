The new bundle submitter uses the wrong JSON-RPC method for Puissant private transaction submission, so the primary production path will not work as intended.

Status: fixed by the Wave H security hardening branch. Current Puissant code and tests use `eth_sendPrivateTransaction`.

Finding:

- [P1] Call the documented Puissant RPC method - `apps/api/src/services/bundle-submitter/puissant-client.ts:68`
  When this client talks to the real 48 Club Puissant endpoint, `eth_sendPrivateRawTransaction` is not one of the documented method names; the private transaction API documents `eth_sendPrivateTransaction` for a signed raw transaction. As written, production submissions will get a JSON-RPC method error and either fall back to the public mempool or fail when `fallbackPublic` is false, so the private path is effectively unusable.
