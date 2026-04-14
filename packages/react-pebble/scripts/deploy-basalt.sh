#!/bin/bash
# Deploy a react-pebble example to the Pebble basalt emulator.
#
# Compiles to Rocky.js or C target for the classic 144x168 basalt platform.
#
# Usage:
#   ./scripts/deploy-basalt.sh watchface              # Rocky.js target (default)
#   ./scripts/deploy-basalt.sh counter --target c     # C target
#   ./scripts/deploy-basalt.sh counter --logs         # with live log streaming

set -e

EXAMPLE="${1:?Usage: deploy-basalt.sh <example-name> [--target rocky|c] [--logs]}"
TARGET="rocky"
LOGS_FLAG=""

shift
while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --logs) LOGS_FLAG="--logs"; shift ;;
    *) shift ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/.pebble-build"

echo "=== Compiling $EXAMPLE (target=$TARGET, platform=basalt) ==="
cd "$PROJECT_DIR"
ENTRY="examples/${EXAMPLE}.tsx" COMPILE_TARGET="$TARGET" PEBBLE_PLATFORM=basalt \
  npx vite build --config vite.config.plugin-test.js 2>&1 | grep "\[react-pebble\]"

echo "=== Building ==="
cd "$BUILD_DIR"
pebble build 2>&1 | tail -5

echo "=== Installing to basalt emulator ==="
pebble kill >/dev/null 2>&1 || true
pebble wipe >/dev/null 2>&1 || true
sleep 2

if [ -n "$LOGS_FLAG" ]; then
  pebble install --emulator basalt --logs
else
  pebble install --emulator basalt --logs > /tmp/react-pebble-basalt-emu.log 2>&1 &
  EMU_PID=$!
  sleep 10
  pebble screenshot "/tmp/react-pebble-basalt-${EXAMPLE}-${TARGET}.png" 2>&1 | tail -1
  echo "=== Screenshot saved to /tmp/react-pebble-basalt-${EXAMPLE}-${TARGET}.png ==="
  pebble kill >/dev/null 2>&1 || true
  kill $EMU_PID 2>/dev/null || true
  wait $EMU_PID 2>/dev/null || true
fi
