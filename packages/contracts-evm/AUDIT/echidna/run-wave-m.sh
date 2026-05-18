#!/usr/bin/env bash
# Run the wave M+N echidna harnesses in sequence.
# Output goes to AUDIT/echidna/results-wave-m/.
#
# Usage:
#   bash AUDIT/echidna/run-wave-m.sh [test_limit]
#
# Defaults to 50000 calls per harness. The brief allows dropping to 20000
# minimum on memory-tight VPSes; lower numbers reduce the chance of finding
# rare counter-examples but bound wall-clock.

set -uo pipefail

cd "$(dirname "$0")/../.."
ROOT="$PWD"
TEST_LIMIT="${1:-50000}"
OUT="AUDIT/echidna/results-wave-m"
mkdir -p "$OUT"

HARNESSES=(
  "EchidnaTaxSplitter:test-echidna/EchidnaTaxSplitter.sol"
  "EchidnaAgentSafeDeployer:test-echidna/EchidnaAgentSafeDeployer.sol"
  "EchidnaWaveMFactory:test-echidna/EchidnaWaveMFactory.sol"
  "EchidnaTreasuryLP4:test-echidna/EchidnaTreasuryLP4.sol"
)

echo "==> running wave M+N echidna sweep (limit=$TEST_LIMIT per harness)"
overall_rc=0
for entry in "${HARNESSES[@]}"; do
  name="${entry%%:*}"
  path="${entry##*:}"
  log="$OUT/${name}.log"
  echo
  echo "==> $name"
  set +e
  docker run --rm \
    -v "$ROOT/../..:/code" \
    -w "/code/packages/contracts-evm" \
    --user "$(id -u):$(id -g)" \
    trailofbits/echidna:latest \
    echidna "$path" \
    --contract "$name" \
    --config echidna.yaml \
    --test-limit "$TEST_LIMIT" \
    2>&1 | tee "$log"
  rc=${PIPESTATUS[0]}
  set -e
  if [ "$rc" -ne 0 ]; then
    overall_rc=1
    echo "==> $name exit=$rc"
  fi
done

echo
echo "==> sweep complete. logs under $OUT/"
exit "$overall_rc"
