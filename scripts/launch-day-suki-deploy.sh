#!/usr/bin/env bash
#
# launch-day-suki-deploy.sh
#
# One-shot SUKI launch-day deploy of the Wave N LaunchFactory + helpers on
# BSC mainnet, followed by BscScan source verification.
#
# Required env:
#   PRIVATE_KEY                  hex priv key for the deployer EOA (sol burner)
#   FACTORY_OWNER                Platform Safe address (multisig contract)
#   PLATFORM_COMMISSION_RECEIVER address that receives platform fees (usually
#                                the Platform Safe as well, but kept separate)
#   ETHERSCAN_API_KEY            Etherscan v2 unified API key
#
# Optional env:
#   BSC_RPC_URL                  override default BSC RPC (defaults to public)
#   SKIP_VERIFY=1                skip the BscScan verify step (NOT recommended)
#   SKIP_BALANCE_CHECK=1         skip the 0.05 BNB minimum balance check
#   LAUNCH_DAY_CONFIRMED=yes     skip the interactive LAUNCH prompt
#
# Usage:
#   export PRIVATE_KEY=0x...
#   export FACTORY_OWNER=0x...        # Platform Safe
#   export PLATFORM_COMMISSION_RECEIVER=0x...
#   export ETHERSCAN_API_KEY=...
#   bash scripts/launch-day-suki-deploy.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$REPO_ROOT/packages/contracts-evm"
ART_PATH="$CONTRACTS_DIR/deployments/bsc-mainnet-wave-n.json"

color() { printf "\033[%sm%s\033[0m" "$1" "$2"; }
log()   { printf "%s %s\n" "$(color 36 "[launch-day]")" "$*"; }
warn()  { printf "%s %s\n" "$(color 33 "[launch-day]")" "$*" >&2; }
fail()  { printf "%s %s\n" "$(color 31 "[launch-day]")" "$*" >&2; exit 1; }

require_env() {
	local name="$1"
	if [[ -z "${!name:-}" ]]; then
		fail "missing required env: $name"
	fi
}

# --- 1. validate env ---
log "validating env ..."
require_env PRIVATE_KEY
require_env FACTORY_OWNER
require_env PLATFORM_COMMISSION_RECEIVER
require_env ETHERSCAN_API_KEY

# normalize PRIVATE_KEY to 0x-prefixed
if [[ "$PRIVATE_KEY" != 0x* ]]; then
	PRIVATE_KEY="0x$PRIVATE_KEY"
	export PRIVATE_KEY
fi
if ! [[ "$PRIVATE_KEY" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
	fail "PRIVATE_KEY must be a 32-byte hex string (0x + 64 hex chars)"
fi

# sanity: FACTORY_OWNER and PLATFORM_COMMISSION_RECEIVER look like addresses
for var in FACTORY_OWNER PLATFORM_COMMISSION_RECEIVER; do
	val="${!var}"
	if ! [[ "$val" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
		fail "$var must be a 20-byte hex address (got: $val)"
	fi
done

ZERO="0x0000000000000000000000000000000000000000"
if [[ "${FACTORY_OWNER,,}" == "${ZERO,,}" ]]; then
	fail "FACTORY_OWNER must not be the zero address"
fi
if [[ "${PLATFORM_COMMISSION_RECEIVER,,}" == "${ZERO,,}" ]]; then
	fail "PLATFORM_COMMISSION_RECEIVER must not be the zero address"
fi

log "FACTORY_OWNER:                $FACTORY_OWNER"
log "PLATFORM_COMMISSION_RECEIVER: $PLATFORM_COMMISSION_RECEIVER"

# --- 2. validate deployer has >= 0.05 BNB on BSC mainnet ---
RPC_URL="${BSC_RPC_URL:-https://bsc-dataseed1.binance.org/}"
if [[ "${SKIP_BALANCE_CHECK:-0}" != "1" ]]; then
	log "checking deployer balance via $RPC_URL ..."
	pushd "$CONTRACTS_DIR" > /dev/null
	BSC_RPC_URL="$RPC_URL" PRIVATE_KEY="$PRIVATE_KEY" \
		./node_modules/.bin/hardhat run scripts/deploy/_balance-check.cjs --network bscMainnet
	popd > /dev/null
else
	warn "SKIP_BALANCE_CHECK=1; skipping the 0.05 BNB minimum balance check"
fi

# --- 3. confirm before broadcasting ---
log "ready to broadcast LaunchFactory + helpers to BSC mainnet."
log "rough cost: ~0.06 BNB at 5 gwei (per fork dry run)."
if [[ "${LAUNCH_DAY_CONFIRMED:-}" != "yes" ]]; then
	read -r -p "$(color 33 '[launch-day]') type LAUNCH to broadcast: " confirm
	if [[ "$confirm" != "LAUNCH" ]]; then
		fail "aborted (did not type LAUNCH)"
	fi
fi

# --- 4. run deploy-wave-n.js ---
log "deploying wave N to BSC mainnet ..."
pushd "$CONTRACTS_DIR" > /dev/null
BSC_RPC_URL="$RPC_URL" \
PRIVATE_KEY="$PRIVATE_KEY" \
FACTORY_OWNER="$FACTORY_OWNER" \
PLATFORM_COMMISSION_RECEIVER="$PLATFORM_COMMISSION_RECEIVER" \
	./node_modules/.bin/hardhat run scripts/deploy/deploy-wave-n.js --network bscMainnet
popd > /dev/null

if [[ ! -f "$ART_PATH" ]]; then
	fail "deploy artifact missing: $ART_PATH"
fi
log "deploy artifact written: $ART_PATH"

# --- 5. read artifact and print contract addresses ---
FACTORY_ADDR=$(jq -r .contracts.LaunchFactory "$ART_PATH")
ROUTER_ADDR=$(jq -r .contracts.RouterDeployer "$ART_PATH")
AGENT_ADDR=$(jq -r .contracts.AgentSafeDeployer "$ART_PATH")
TREASURY_ADDR=$(jq -r .contracts.TreasuryLP4Deployer "$ART_PATH")

log "deployed contracts:"
echo "  LaunchFactory       : $FACTORY_ADDR"
echo "  RouterDeployer      : $ROUTER_ADDR"
echo "  AgentSafeDeployer   : $AGENT_ADDR"
echo "  TreasuryLP4Deployer : $TREASURY_ADDR"

# --- 6. bscscan verify ---
if [[ "${SKIP_VERIFY:-0}" != "1" ]]; then
	log "verifying contracts on BscScan ..."
	pushd "$CONTRACTS_DIR" > /dev/null
	ETHERSCAN_API_KEY="$ETHERSCAN_API_KEY" \
		./node_modules/.bin/hardhat run scripts/deploy/verify-wave-n.js --network bscMainnet
	popd > /dev/null
else
	warn "SKIP_VERIFY=1; skipping BscScan source verification"
fi

# --- 7. print env updates needed ---
cat <<EOF

$(color 32 "============================================================")
$(color 32 "SUKI launch-day deploy: SUCCESS")
$(color 32 "============================================================")

NEW factory address: $FACTORY_ADDR
View: https://bscscan.com/address/$FACTORY_ADDR#code

NEXT STEPS (manual, do not skip):

1. Update Vercel (frontend) env vars:
   NEXT_PUBLIC_LAUNCH_FACTORY_ADDRESS=$FACTORY_ADDR
   NEXT_PUBLIC_TREASURY_LP4_DEPLOYER=$TREASURY_ADDR

2. Update Railway (apps/api) env vars:
   LAUNCH_FACTORY_ADDRESS=$FACTORY_ADDR
   ROUTER_DEPLOYER_ADDRESS=$ROUTER_ADDR
   AGENT_SAFE_DEPLOYER_ADDRESS=$AGENT_ADDR
   TREASURY_LP4_DEPLOYER_ADDRESS=$TREASURY_ADDR

3. Update the indexer config (if separate) with the new factory address
   and re-index from the factory's deploy block.

4. Trigger Vercel + Railway redeploy.

5. Smoke test: hit the wizard, fund the launch wallet, deposit, graduate.

EOF
