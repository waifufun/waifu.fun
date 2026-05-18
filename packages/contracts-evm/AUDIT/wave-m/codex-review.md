# Codex Review (wave M + N security pass)

**Status:** Could not run in the audit sandbox — the codex CLI's bubblewrap
sandbox cannot configure loopback networking on this VPS.

## Reproduction

```
$ codex review --base origin/develop
warning: Codex could not find bubblewrap on PATH. Install bubblewrap with
  your OS package manager. ... Codex will use the vendored bubblewrap in
  the meantime.
Unable to inspect the diff because every shell command failed with
  `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`.
No actionable findings can be reported without access to the changes.
```

This matches the "known sandbox gotcha" from the brief: codex review needs
bwrap, and bwrap loopback networking is blocked on the builder-14 / shared
VPS the security pass ran on.

## Mitigation

- The same code path was audited by slither + manual review (see
  `slither.log` and the triage table in `REPORT.md`).
- Echidna + foundry invariants exercise the runtime properties (50K calls
  per harness, 256x64 invariant runs).
- 22 adversarial mocha cases on `wave-m-adversarial.test.js` and 14 on
  `wave-n-adversarial.test.js` cover the attacker-controlled inputs.

## TODO before merge

Run `codex review --base origin/develop` locally (host with working
bubblewrap, or `--sandbox danger-full-access` if you trust the diff) and
attach the output as a PR comment. Block merge on any HIGH/MEDIUM finding
codex surfaces that slither + manual review missed.

Command to run locally:

```
cd packages/contracts-evm
codex review --base origin/develop
```

If bubblewrap is still uncooperative, try:

```
codex review --base origin/develop -c sandbox_workspace_write.network_access=true
```

or run codex from inside docker with its own sandbox layer disabled.
