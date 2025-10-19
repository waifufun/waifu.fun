#!/bin/bash

echo "🛑 Stopping Jeju Localnet services"
echo ""

# Stop Docker services
if [ -f "docker-compose.localnet.yml" ]; then
  echo "🐳 Stopping Docker services..."
  docker compose -f docker-compose.localnet.yml down
  echo "✅ Docker services stopped"
else
  echo "⚠️  docker-compose.localnet.yml not found, skipping Docker cleanup"
fi

# Stop Jeju node (if we started it)
echo ""
echo "🔧 Stopping Jeju L2 node..."
cd ../..
if [ -f "scripts/localnet/stop.ts" ]; then
  bun run scripts/localnet/stop.ts
  echo "✅ Jeju node stopped"
else
  echo "⚠️  Jeju localnet stop script not found"
  echo "💡 You may need to manually stop the Jeju node process"
fi
cd apps/launchpad

echo ""
echo "✅ Localnet stopped"
echo ""
