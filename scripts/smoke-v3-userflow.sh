#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-}"
RUN_WRITE_SMOKE="${RUN_WRITE_SMOKE:-0}"
STEWARD_TOKEN="${STEWARD_TOKEN:-}"
SMOKE_SUFFIX="$(date -u +%Y%m%dT%H%M%SZ)-$$"
SMOKE_EMAIL="${SMOKE_EMAIL:-v3-userflow-${SMOKE_SUFFIX}@example.com}"

if [[ -z "$API_BASE_URL" ]]; then
  echo "API_BASE_URL is required, for example: API_BASE_URL=https://api.waifu.fun RUN_WRITE_SMOKE=1 $0" >&2
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
  local expected_statuses="${4:-200}"
  local auth="${5:-}"
  local name="$method $path"
  local out="$LAST_RESPONSE"
  local status
  local curl_args=(-sS -o "$out" -w '%{http_code}' -X "$method")

  if [[ -n "$body" ]]; then
    curl_args+=(-H 'Content-Type: application/json' --data "$body")
  fi
  if [[ -n "$auth" ]]; then
    curl_args+=(-H "Authorization: Bearer $auth")
  fi

  status="$(curl "${curl_args[@]}" "$API_BASE_URL$path")"

  if [[ " $expected_statuses " != *" $status "* ]]; then
    echo "✗ $name expected HTTP one of [$expected_statuses], got $status" >&2
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

json_value() {
  local expr="$1"
  local file="$2"
  if ((${#JQ[@]} == 0)); then
    return 1
  fi
  jq -r "$expr" "$file"
}

status="$(curl -sS -o "$LAST_RESPONSE" -w '%{http_code}' "$API_BASE_URL/health" || true)"
if [[ "$status" =~ ^[23] ]]; then
  echo "✓ GET /health HTTP $status"
else
  echo "! GET /health returned HTTP $status, continuing with v3 user-flow smoke"
fi

request GET /v3/launchpads "" 200
assert_json '.ok == true' "$LAST_RESPONSE" 'launchpad list envelope ok=true'
assert_json '[.data[].id] | index("four-meme-tax") != null' "$LAST_RESPONSE" 'launchpad list includes four-meme-tax'
assert_json '[.data[].id] | index("pump-fun") != null' "$LAST_RESPONSE" 'launchpad list includes pump-fun'

request GET /v3/launchpads/four-meme-tax "" 200
assert_json '.ok == true and .data.descriptor.id == "four-meme-tax"' "$LAST_RESPONSE" 'four-meme-tax descriptor returned'
assert_json '.data.defaultFeeConfig.kind == "four-meme-tax"' "$LAST_RESPONSE" 'four-meme-tax default config returned'

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
assert_json '.ok == true and .data.ok == true and (.data.errors | length) == 0' "$LAST_RESPONSE" 'option 3 four-meme-tax fee config validates'

INVALID_VALIDATE_BODY='{
  "env": "prod",
  "feeConfig": {
    "kind": "four-meme-tax",
    "taxBps": 200,
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
request POST /v3/launchpads/four-meme-tax/validate "$INVALID_VALIDATE_BODY" 200
assert_json '.ok == true and .data.ok == false and (.data.errors | length) > 0' "$LAST_RESPONSE" 'prod bounds reject invalid option 3 taxBps=200'

if [[ "$RUN_WRITE_SMOKE" != "1" ]]; then
  echo "Skipping write smoke. Set RUN_WRITE_SMOKE=1 to POST waitlist and authed agent flows."
  echo "v3 user-flow public smoke passed for $API_BASE_URL"
  exit 0
fi

WAITLIST_BODY="$(printf '{"email":"%s"}' "$SMOKE_EMAIL")"
request POST /v3/launchpads/pump-fun/waitlist "$WAITLIST_BODY" 201
assert_json '.ok == true and .waitlist.email != null and (.count | type == "number")' "$LAST_RESPONSE" 'pump-fun waitlist first write succeeded'

# Current v3 waitlist is idempotent and returns the existing row with 201. If a
# deployment later changes duplicate semantics to 409, treat that as acceptable
# as long as it is not a server error.
request POST /v3/launchpads/pump-fun/waitlist "$WAITLIST_BODY" "201 409"
if [[ "$(cat "$LAST_RESPONSE")" == *'"ok":true'* ]]; then
  assert_json '.ok == true and .waitlist.email != null' "$LAST_RESPONSE" 'pump-fun duplicate waitlist returned existing row'
else
  assert_json '(.error != null or .errors != null)' "$LAST_RESPONSE" 'pump-fun duplicate waitlist returned explicit duplicate error'
fi

if [[ -z "$STEWARD_TOKEN" ]]; then
  echo "Skipping authenticated smoke. Set STEWARD_TOKEN to exercise POST /v3/agents, safe lookup, and launch error paths."
  echo "v3 user-flow write smoke passed for $API_BASE_URL"
  exit 0
fi

AGENT_ID="waifu-smoke-${SMOKE_SUFFIX}"
CREATE_BODY="$(cat <<JSON
{
  "agent_id": "$AGENT_ID",
  "name": "V3 Smoke $SMOKE_SUFFIX",
  "bio": "Black-box v3 user-flow smoke agent",
  "avatar_url": "https://example.com/waifu-smoke.png",
  "chain": "bsc",
  "launchpad_id": "four-meme-tax",
  "launchpad_config": {
    "kind": "four-meme-tax",
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
  },
  "metadata": { "smoke": "v3-userflow" }
}
JSON
)"
request POST /v3/agents "$CREATE_BODY" 201 "$STEWARD_TOKEN"
assert_json '.ok == true and .agent.agentId != null' "$LAST_RESPONSE" 'authenticated agent create accepted provision payload'
CREATED_AGENT_ID="$(json_value '.agent.agentId' "$LAST_RESPONSE" || printf '%s' "$AGENT_ID")"

request GET "/v3/agents/${CREATED_AGENT_ID}/safe?chain=bsc" "" "200 404"
if [[ "$(cat "$LAST_RESPONSE")" == *'"safe"'* ]]; then
  assert_json '.ok == true and .safe.safeAddress != null and .safe.autonomy != null' "$LAST_RESPONSE" 'safe metadata shape returned'
else
  assert_json '(.error == "safe not found") or (.ok == false)' "$LAST_RESPONSE" 'missing safe returns explicit non-500 response'
fi

LAUNCH_BODY='{
  "ticker": "SMOKE",
  "logo_url": "https://example.com/waifu-smoke.png",
  "initialBuyBnb": "0"
}'
request POST "/v3/agents/${CREATED_AGENT_ID}/launch" "$LAUNCH_BODY" "400 401 403 502" "$STEWARD_TOKEN"
assert_json '.ok == false or .error != null' "$LAST_RESPONSE" 'launch failure is explicit JSON, not a 500'
if ((${#JQ[@]} != 0)) && jq -e '.error == "safe deploy failed"' "$LAST_RESPONSE" >/dev/null; then
  assert_json '(.message | test("SAFE_DEPLOYMENT_FUNDER_PK|funder|private key|configured"; "i"))' "$LAST_RESPONSE" 'safe deploy failure names missing funder configuration'
else
  echo "! Launch did not reach Safe deploy. This usually means the smoke token does not own the just-created v3 agent yet; response was still non-500."
fi

echo "v3 user-flow smoke passed for $API_BASE_URL"
