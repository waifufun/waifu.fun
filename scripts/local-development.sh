#!/bin/bash
EXPECTED_CONTAINERS=("waifufun-dragonfly" "waifufun-minio" "waifufun-mongo1" "waifufun-mongo2" "waifufun-mongo3")
TIMEOUT=300
INTERVAL=5

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
  exit 0
fi

echo "🚀 Starting missing Docker services with pnpm..."
pnpm run docker:up

echo "⏳ Waiting for containers to be ready..."
start_time=$(date +%s)

while true; do
  current_time=$(date +%s)
  elapsed=$((current_time - start_time))
  
  if [ $elapsed -gt $TIMEOUT ]; then
    echo "❌ Timeout waiting for containers to be ready after ${TIMEOUT} seconds"
    exit 1
  fi

  all_ready=true
  
  for container in "${EXPECTED_CONTAINERS[@]}"; do
    status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null)
    health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null)
    
    if [ "$status" != "running" ]; then
      echo "⏳ Container '$container' is not running yet (status: $status)"
      all_ready=false
      break
    fi
    
    if [ "$health" != "none" ] && [ "$health" != "healthy" ]; then
      echo "⏳ Container '$container' is not healthy yet (health: $health)"
      all_ready=false
      break
    fi
  done
  
  if $all_ready; then
    echo "✅ All containers are ready and healthy!"
    exit 0
  fi
  
  sleep $INTERVAL
done
