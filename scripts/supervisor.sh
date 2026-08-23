#!/bin/bash
cd "$(dirname "$0")/.."
pkill -f "node server.js" 2>/dev/null
pkill -f "cloudflared tunnel" 2>/dev/null
sleep 1

start_server() {
  PORT=3000 FALLBACK_PORT=8099 nohup node server.js >> logs-server.txt 2>&1 &
  echo $!
}

SERVER_PID=$(start_server)
CF_PID=""
echo "supervisor started $(date)" >> logs-supervisor.txt

while true; do
  sleep 5
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "server died, restarting $(date)" >> logs-supervisor.txt
    SERVER_PID=$(start_server)
  fi
  if [ -z "$CF_PID" ] || ! kill -0 "$CF_PID" 2>/dev/null; then
    echo "starting tunnel $(date)" >> logs-supervisor.txt
    rm -f logs-cf.txt public-url.txt
    nohup ./tools/cloudflared tunnel --url http://localhost:8099 --no-autoupdate > logs-cf.txt 2>&1 &
    CF_PID=$!
    for i in $(seq 1 30); do
      sleep 4
      URL=$(grep -o 'https://[a-z0-9.-]*trycloudflare\.com' logs-cf.txt 2>/dev/null | head -1)
      if [ -n "$URL" ]; then
        printf '%s' "$URL" > public-url.txt
        echo "tunnel up: $URL $(date)" >> logs-supervisor.txt
        break
      fi
    done
  fi
done
