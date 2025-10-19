#!/bin/bash

set -e

echo "🚀 Starting Jeju Localnet for auto.fun"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: Must run from apps/launchpad directory"
  exit 1
fi

# Check for required tools
command -v bun >/dev/null 2>&1 || { echo "❌ Error: bun is required but not installed"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Error: docker is required but not installed"; exit 1; }

# Set environment
export NEXT_PUBLIC_JEJU_NETWORK=localnet
export JEJU_RPC_URL=http://127.0.0.1:9545

echo "📋 Environment Check"
echo "  - Jeju Network: localnet"
echo "  - RPC URL: $JEJU_RPC_URL"
echo ""

# Start Jeju localnet from root
echo "🔧 Starting Jeju L2 node..."
cd ../..

# Fail if script doesn't exist
if [ ! -f "scripts/localnet/start.ts" ]; then
  echo "❌ ERROR: scripts/localnet/start.ts not found"
  echo "💡 Make sure you're running from the correct directory"
  exit 1
fi

# Start the node
bun run scripts/localnet/start.ts &
JEJU_PID=$!
echo "  Started Jeju node (PID: $JEJU_PID)"

# Verify it started
sleep 2
if ! kill -0 $JEJU_PID 2>/dev/null; then
  echo "❌ ERROR: Failed to start Jeju node"
  exit 1
fi

cd apps/launchpad

# Wait for RPC to be ready
echo ""
echo "⏳ Waiting for Jeju RPC to be ready..."
RETRIES=0
MAX_RETRIES=30
while [ $RETRIES -lt $MAX_RETRIES ]; do
  if curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    $JEJU_RPC_URL > /dev/null 2>&1; then
    echo "✅ Jeju RPC is ready!"
    break
  fi
  RETRIES=$((RETRIES+1))
  if [ $RETRIES -eq $MAX_RETRIES ]; then
    echo "❌ Timeout waiting for Jeju RPC"
    exit 1
  fi
  sleep 2
  echo "  Retry $RETRIES/$MAX_RETRIES..."
done

# Deploy contracts
echo ""
echo "📝 Deploying contracts to Jeju localnet..."
if [ ! -f "scripts/deploy-jeju.ts" ]; then
  echo "❌ ERROR: scripts/deploy-jeju.ts not found"
  exit 1
fi

bun run scripts/deploy-jeju.ts || {
  echo "❌ ERROR: Contract deployment failed"
  exit 1
}
echo "✅ Contracts deployed"

# Start Docker services
echo ""
echo "🐳 Starting Docker services..."
if [ ! -f "docker-compose.localnet.yml" ]; then
  echo "❌ ERROR: docker-compose.localnet.yml not found"
  exit 1
fi

docker compose -f docker-compose.localnet.yml up -d || {
  echo "❌ ERROR: Failed to start Docker services"
  exit 1
}
echo "✅ Docker services started"

echo ""
echo "✅ Jeju Localnet is ready!"
echo ""
echo "📍 Services:"
echo "  - Jeju RPC:       http://127.0.0.1:9545"
echo "  - Block Explorer: http://localhost:4000 (if configured)"
echo "  - Frontend:       http://localhost:3000 (after 'bun run dev')"
echo ""
echo "🔧 Next steps:"
echo "  1. Run 'bun run validate:env' to check environment"
echo "  2. Run 'bun run dev' to start the frontend"
echo ""
echo "💡 To stop localnet: ./scripts/localnet-stop.sh"
echo ""
