# Flap Portal rate-limit / cooldown probe

Probe artifacts characterizing Flap's `RateLimitExceeded(address user, uint256 unlockTime)`
error and the tax-splitter dispatch flow. Used to size the launch-v3 signing-wallet pool.

## Run

Start a ganache fork at BSC block 97368808 (or any clean pin):

```bash
nohup bunx ganache \
  --fork.url "$ALCHEMY_BSC_URL" \
  --fork.blockNumber 97368808 \
  --chain.chainId 56 \
  --wallet.totalAccounts 10 \
  --wallet.defaultBalance 1000 \
  --server.host 127.0.0.1 \
  --server.port 8546 > /tmp/ganache.log 2>&1 &
sleep 12
```

Then run any of:

- `node probe/cooldown.cjs` -- caller-dimension probe (msg.sender vs tx.origin).
- `node probe/cooldown-pinpoint2.cjs` -- per-trial cooldown read from `unlockTime`.
- `node probe/cooldown-binsearch.cjs` -- binary search for the cooldown window.
- `node probe/tax-stream-4.cjs` -- launch token, swap via PCS V2, dispatch splitter.

ABI / artifact deps are pulled from `../flap-bundle-probe/packages/contracts-evm`.

## Output

Each probe writes a `*.json` file alongside the script with structured findings.

See `~/.moltbot/projects/steward/FLAP_BUNDLE_PROBE_FINDINGS.md` for the writeup.
