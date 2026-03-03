#!/bin/bash

# Base URL and headers
URL="https://api-mainnet.waifu.fun/tokens"
ORIGIN="https://waifu.fun"

# Initial page
page=1

while true; do
  echo "Fetching page $page..."

  # Make the request and capture the response
  response=$(curl -s "$URL" \
    -H "accept: application/json" \
    -H "accept-language: en-US,en;q=0.5" \
    -H "content-type: application/json" \
    -H "origin: $ORIGIN" \
    -H "priority: u=1, i" \
    -H "referer: $ORIGIN/" \
    -H 'sec-ch-ua: "Not)A;Brand";v="8", "Chromium";v="138", "Brave";v="138"' \
    -H 'sec-ch-ua-mobile: ?0' \
    -H 'sec-ch-ua-platform: "Linux"' \
    -H 'sec-fetch-dest: empty' \
    -H 'sec-fetch-mode: cors' \
    -H 'sec-fetch-site: cross-site' \
    -H 'sec-fetch-storage-access: none' \
    -H 'sec-gpc: 1' \
    -H 'user-agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36' \
    --data-raw "{\"page\":$page,\"category\":\"new\",\"origin\":\"auto-fun\",\"search\":\"\",\"limit\":50}")

  # Print or process response

  echo "$page"

  # Check if there's a next page
  has_next=$(echo "$response" | grep -o '"hasNextPage":true')

  if [[ -z $has_next ]]; then
    echo "No more pages. Done."
    break
  fi

  # Increment page number
  ((page++))
done
