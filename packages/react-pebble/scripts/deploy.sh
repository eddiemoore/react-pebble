#!/bin/bash
# Deploy a react-pebble example to the Pebble Alloy emulator.
#
# Uses the Vite plugin to compile + scaffold .pebble-build/, then
# builds and installs to the emulator.
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
BUILD_DIR="$PROJECT_DIR/.pebble-build"

echo "=== Compiling + scaffolding $EXAMPLE ==="
cd "$PROJECT_DIR"
ENTRY="examples/${EXAMPLE}.tsx" npx vite build --config vite.config.plugin-test.js 2>&1 | grep "\[react-pebble\]"

echo "=== Building ==="
cd "$BUILD_DIR"
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
