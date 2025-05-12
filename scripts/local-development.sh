#!/bin/bash
EXPECTED_CONTAINERS=("dragonfly" "autofun-minio" "mongo1" "mongo2" "mongo3")

all_running=true

for container in "${EXPECTED_CONTAINERS[@]}"; do
  if ! docker ps --filter "name=^/${container}$" --filter "status=running" | grep -q "$container"; then
    echo "Container '$container' is not running."
    all_running=false
    break
  fi
done

if $all_running; then
  echo "✅ All Docker services are already running."
else
  echo "🚀 Starting missing Docker services with pnpm..."
  pnpm run docker:up
fi
