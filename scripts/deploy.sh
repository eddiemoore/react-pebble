#!/bin/bash
# Deploy a react-pebble example to the Pebble Alloy emulator.
#
# Usage:
#   ./scripts/deploy.sh watchface          # compile + build + install + screenshot
#   ./scripts/deploy.sh counter --logs     # with live log streaming
#   SETTLE_MS=200 ./scripts/deploy.sh jira-list  # with async settle delay

set -e

EXAMPLE="${1:?Usage: deploy.sh <example-name> [--logs]}"
LOGS_FLAG=""
if [ "$2" = "--logs" ]; then LOGS_FLAG="--logs"; fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SPIKE_DIR="$PROJECT_DIR/pebble-spike"

echo "=== Compiling $EXAMPLE ==="
cd "$PROJECT_DIR"
EXAMPLE="$EXAMPLE" npx tsx scripts/compile-to-piu.ts > "$SPIKE_DIR/src/embeddedjs/main.js" 2>/tmp/react-pebble-compile.log
cat /tmp/react-pebble-compile.log >&2

echo "=== Building ==="
cd "$SPIKE_DIR"
pebble build 2>&1 | tail -5

echo "=== Installing to emery emulator ==="
pebble kill >/dev/null 2>&1 || true
pebble wipe >/dev/null 2>&1 || true
sleep 2

if [ -n "$LOGS_FLAG" ]; then
  pebble install --emulator emery --logs
else
  pebble install --emulator emery --logs > /tmp/react-pebble-emu.log 2>&1 &
  EMU_PID=$!
  sleep 10
  pebble screenshot "/tmp/react-pebble-${EXAMPLE}.png" 2>&1 | tail -1
  echo "=== Screenshot saved to /tmp/react-pebble-${EXAMPLE}.png ==="
  pebble kill >/dev/null 2>&1 || true
  kill $EMU_PID 2>/dev/null || true
  wait $EMU_PID 2>/dev/null || true
fi
