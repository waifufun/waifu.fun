#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-}"
RUN_WRITE_SMOKE="${RUN_WRITE_SMOKE:-0}"
SMOKE_EMAIL="${SMOKE_EMAIL:-v3-smoke@example.com}"

if [[ -z "$API_BASE_URL" ]]; then
  echo "API_BASE_URL is required, for example: API_BASE_URL=https://api.waifu.fun $0" >&2
  exit 64
fi

API_BASE_URL="${API_BASE_URL%/}"

if command -v jq >/dev/null 2>&1; then
  JQ=(jq -e)
else
  JQ=()
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
LAST_RESPONSE="$TMP_DIR/response.json"

request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local expected_status="${4:-200}"
  local name="$method $path"
  local out="$LAST_RESPONSE"
  local status

  if [[ -n "$body" ]]; then
    status="$(curl -sS -o "$out" -w '%{http_code}' \
      -X "$method" \
      -H 'Content-Type: application/json' \
      --data "$body" \
      "$API_BASE_URL$path")"
  else
    status="$(curl -sS -o "$out" -w '%{http_code}' \
      -X "$method" \
      "$API_BASE_URL$path")"
  fi

  if [[ "$status" != "$expected_status" ]]; then
    echo "✗ $name expected HTTP $expected_status, got $status" >&2
    cat "$out" >&2
    echo >&2
    exit 1
  fi

  echo "✓ $name HTTP $status"
  cat "$out"
  echo
}

assert_json() {
  local expr="$1"
  local file="$2"
  local message="$3"

  if ((${#JQ[@]} == 0)); then
    echo "  jq not found, skipping JSON assertion: $message"
    return 0
  fi

  if ! "${JQ[@]}" "$expr" "$file" >/dev/null; then
    echo "✗ assertion failed: $message" >&2
    cat "$file" >&2
    echo >&2
    exit 1
  fi
  echo "  assertion ok: $message"
}

# Health is useful but not all deployments expose it at the same mount during previews.
status="$(curl -sS -o "$LAST_RESPONSE" -w '%{http_code}' "$API_BASE_URL/health" || true)"
if [[ "$status" =~ ^[23] ]]; then
  echo "✓ GET /health HTTP $status"
else
  echo "! GET /health returned HTTP $status, continuing with v3 route smoke"
fi

request GET /v3/launchpads "" 200
assert_json '.ok == true' "$LAST_RESPONSE" 'launchpad list envelope ok=true'
assert_json '[.data[].id] | index("four-meme-tax") != null' "$LAST_RESPONSE" 'launchpad list includes four-meme-tax'
assert_json '[.data[].id] | index("pump-fun") != null' "$LAST_RESPONSE" 'launchpad list includes pump-fun'

request GET /v3/launchpads/four-meme-tax "" 200
assert_json '.ok == true and .data.descriptor.id == "four-meme-tax"' "$LAST_RESPONSE" 'four-meme-tax descriptor returned'
assert_json '.data.defaultFeeConfig.kind == "four-meme-tax"' "$LAST_RESPONSE" 'four-meme-tax default config returned'

# Option 3 four-meme-tax fee config: platformCutBps=2500 (25% off the top of
# the tax stream) and the creator's 4-way split sums to 7500 (10000 - 2500).
VALIDATE_BODY='{
  "env": "prod",
  "feeConfig": {
    "kind": "four-meme-tax",
    "taxBps": 300,
    "platformCutBps": 2500,
    "allocation": {
      "founderBps": 4000,
      "holderBps": 2000,
      "burnBps": 750,
      "liquidityBps": 750
    },
    "minHolderBalance": "1000000000000000000"
  }
}'
request POST /v3/launchpads/four-meme-tax/validate "$VALIDATE_BODY" 200
assert_json '.ok == true and .data.ok == true' "$LAST_RESPONSE" 'option 3 four-meme-tax fee config validates'

if [[ "$RUN_WRITE_SMOKE" == "1" ]]; then
  WAITLIST_BODY="$(printf '{"email":"%s"}' "$SMOKE_EMAIL")"
  request POST /v3/launchpads/pump-fun/waitlist "$WAITLIST_BODY" 201
  assert_json '.ok == true and .waitlist.email != null and (.count | type == "number")' "$LAST_RESPONSE" 'pump-fun waitlist write succeeded'
else
  echo "Skipping write smoke. Set RUN_WRITE_SMOKE=1 to POST /v3/launchpads/pump-fun/waitlist."
fi

echo "v3 launchpad smoke passed for $API_BASE_URL"
