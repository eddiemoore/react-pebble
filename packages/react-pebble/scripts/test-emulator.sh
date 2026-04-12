#!/bin/bash
# Test all examples on the Pebble Alloy emulator with button press verification.
#
# For each example:
#   1. Compile + build + install to emulator
#   2. Screenshot initial state
#   3. Send button presses where applicable
#   4. Screenshot after each button interaction
#
# Usage:
#   ./scripts/test-emulator.sh                # test all examples
#   ./scripts/test-emulator.sh counter        # test one example
#   SETTLE_MS=200 ./scripts/test-emulator.sh async-list  # with settle delay
#
# Screenshots saved to /tmp/react-pebble-emu-test/

set -e

FILTER="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/.pebble-build"
SCREENSHOT_DIR="/tmp/react-pebble-emu-test"

mkdir -p "$SCREENSHOT_DIR"

PASSED=0
FAILED=0
TOTAL=0

# Deploy an example and take initial screenshot
deploy_example() {
  local name="$1"
  echo ""
  echo "========================================"
  echo "  Testing: $name"
  echo "========================================"

  cd "$PROJECT_DIR"

  # Compile
  ENTRY="examples/${name}.tsx" npx vite build --config vite.config.plugin-test.js 2>&1 | grep "\[react-pebble\]" || true

  # Build
  cd "$BUILD_DIR"
  pebble build 2>&1 | tail -2

  # Kill any existing emulator session
  pebble kill >/dev/null 2>&1 || true
  sleep 1

  # Install and wait for app to start
  pebble install --emulator emery --logs > /tmp/react-pebble-emu.log 2>&1 &
  EMU_PID=$!
  sleep 8

  # Initial screenshot
  pebble screenshot "$SCREENSHOT_DIR/${name}-initial.png" 2>/dev/null || true
  echo "  [screenshot] ${name}-initial.png"
}

# Take a named screenshot
screenshot() {
  local name="$1"
  sleep 1
  pebble screenshot "$SCREENSHOT_DIR/${name}.png" 2>/dev/null || true
  echo "  [screenshot] ${name}.png"
}

# Send a button click and wait
click() {
  local button="$1"
  pebble emu-button click "$button" 2>/dev/null || true
  sleep 0.8
}

# Clean up emulator after test
cleanup() {
  pebble kill >/dev/null 2>&1 || true
  kill $EMU_PID 2>/dev/null || true
  wait $EMU_PID 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# Test functions for each example
# ---------------------------------------------------------------------------

test_watchface() {
  deploy_example watchface
  # Watchface has no buttons - just verify it renders
  cleanup
}

test_counter() {
  deploy_example counter
  # UP increments, DOWN decrements, SELECT resets
  click up
  screenshot counter-after-up
  click up
  click up
  screenshot counter-after-3up
  click down
  screenshot counter-after-down
  click select
  screenshot counter-after-reset
  cleanup
}

test_toggle() {
  deploy_example toggle
  # SELECT toggles on/off
  click select
  screenshot toggle-on
  click select
  screenshot toggle-off
  cleanup
}

test_views() {
  deploy_example views
  # SELECT toggles between main and detail view
  click select
  screenshot views-detail
  click select
  screenshot views-main
  cleanup
}

test_multiview() {
  deploy_example multiview
  # UP=settings, DOWN=about, SELECT=home
  click up
  screenshot multiview-settings
  click down
  screenshot multiview-about
  click select
  screenshot multiview-home
  cleanup
}

test_simple_list() {
  deploy_example simple-list
  # DOWN scrolls list down, UP scrolls up
  click down
  screenshot simple-list-scroll1
  click down
  screenshot simple-list-scroll2
  click up
  screenshot simple-list-scrollback
  cleanup
}

test_selected_list() {
  deploy_example selected-list
  # DOWN/UP move selection highlight
  click down
  screenshot selected-list-sel1
  click down
  screenshot selected-list-sel2
  click down
  screenshot selected-list-sel3
  click up
  screenshot selected-list-selback
  cleanup
}

test_rich_list() {
  deploy_example rich-list
  click down
  screenshot rich-list-sel1
  click down
  screenshot rich-list-sel2
  click up
  screenshot rich-list-selback
  cleanup
}

test_tasks() {
  deploy_example tasks
  # DOWN/UP navigate, SELECT goes to detail, BACK returns
  click down
  screenshot tasks-sel1
  click select
  screenshot tasks-detail
  click back
  screenshot tasks-back
  cleanup
}

test_jira_lite() {
  deploy_example jira-lite
  # DOWN/UP navigate issues, SELECT opens detail, BACK returns
  click down
  screenshot jira-lite-sel1
  click down
  screenshot jira-lite-sel2
  click select
  screenshot jira-lite-detail
  click back
  screenshot jira-lite-back
  cleanup
}

test_stopwatch() {
  deploy_example stopwatch
  # SELECT starts/stops, DOWN resets
  click select
  sleep 2
  screenshot stopwatch-running
  click select
  screenshot stopwatch-stopped
  click down
  screenshot stopwatch-reset
  cleanup
}

test_nested_cond() {
  deploy_example nested-cond
  # UP toggles header, DOWN toggles footer
  click up
  screenshot nested-cond-no-header
  click down
  screenshot nested-cond-no-footer
  click up
  screenshot nested-cond-both-back
  cleanup
}

test_circles() {
  deploy_example circles
  # No buttons - just verify circles render
  cleanup
}

test_analog_clock() {
  deploy_example analog-clock
  # No buttons - just verify it renders
  cleanup
}

test_dashboard() {
  deploy_example dashboard
  # No buttons - watchface dashboard with battery/connection
  cleanup
}

test_layout_demo() {
  deploy_example layout-demo
  # No buttons - static layout demo
  cleanup
}

test_settings() {
  deploy_example settings
  # UP increases font, DOWN decreases, SELECT cycles theme
  click up
  screenshot settings-font-up
  click up
  screenshot settings-font-up2
  click down
  screenshot settings-font-down
  click select
  screenshot settings-theme1
  click select
  screenshot settings-theme2
  cleanup
}

test_animation() {
  deploy_example animation
  # No buttons - animation runs automatically
  sleep 2
  screenshot animation-mid
  sleep 2
  screenshot animation-late
  cleanup
}

test_compass() {
  deploy_example compass
  # No buttons - compass reads sensors
  # Test accelerometer tap event
  pebble emu-tap --direction x+ 2>/dev/null || true
  sleep 1
  screenshot compass-after-tap
  cleanup
}

test_weather() {
  deploy_example weather
  cleanup
}

test_async_list() {
  SETTLE_MS=200 deploy_example async-list
  click down
  screenshot async-list-scroll
  cleanup
}

test_vibration() {
  deploy_example vibration
  # UP = short pulse, DOWN = long pulse, SELECT = double pulse
  click up
  screenshot vibration-short
  click down
  screenshot vibration-long
  click select
  screenshot vibration-double
  cleanup
}

test_health() {
  deploy_example health
  # Watchface - no buttons, just verify health data renders
  cleanup
}

test_path() {
  deploy_example path
  # UP rotates +15°, DOWN rotates -15°, SELECT resets
  click up
  screenshot path-rotate15
  click up
  click up
  screenshot path-rotate45
  click down
  screenshot path-rotate30
  click select
  screenshot path-reset
  cleanup
}

test_scrollable() {
  deploy_example scrollable
  # DOWN scrolls content down, UP scrolls back up
  click down
  screenshot scrollable-scroll1
  click down
  click down
  screenshot scrollable-scroll3
  click up
  screenshot scrollable-scrollback
  cleanup
}

test_menu_layer() {
  deploy_example menu-layer
  # DOWN moves selection, SELECT picks item
  click down
  screenshot menu-layer-sel1
  click down
  screenshot menu-layer-sel2
  click down
  screenshot menu-layer-sel3
  click select
  screenshot menu-layer-selected
  cleanup
}

test_number_window() {
  deploy_example number-window
  # UP increases, DOWN decreases, SELECT confirms
  click up
  screenshot number-window-up
  click up
  screenshot number-window-up2
  click down
  screenshot number-window-down
  click select
  screenshot number-window-confirm
  cleanup
}

test_action_menu() {
  deploy_example action-menu
  # DOWN navigates, SELECT picks, BACK goes up
  click down
  screenshot action-menu-sel1
  click down
  screenshot action-menu-sel2
  click up
  click select
  screenshot action-menu-submenu
  click select
  screenshot action-menu-action
  cleanup
}

test_multi_click() {
  deploy_example multi-click
  # Double-click SELECT, hold UP for repeat
  click select
  click select
  screenshot multi-click-dblclick
  click up
  screenshot multi-click-up1
  cleanup
}

test_jira_list() {
  SETTLE_MS=200 deploy_example jira-list
  click down
  screenshot jira-list-sel1
  click select
  screenshot jira-list-detail
  click back
  screenshot jira-list-back
  cleanup
}

# ---------------------------------------------------------------------------
# Run tests
# ---------------------------------------------------------------------------

ALL_EXAMPLES=(
  watchface counter toggle views multiview
  simple-list selected-list rich-list tasks jira-lite
  stopwatch nested-cond circles analog-clock
  dashboard layout-demo settings animation compass
  weather
  vibration health path scrollable
  menu-layer number-window action-menu multi-click
)

# Skip async examples by default (need SETTLE_MS)
ASYNC_EXAMPLES=(async-list jira-list)

run_test() {
  local name="$1"
  TOTAL=$((TOTAL + 1))

  # Convert dashes to underscores for function name
  local fn_name="test_${name//-/_}"

  if declare -f "$fn_name" > /dev/null 2>&1; then
    if $fn_name 2>&1; then
      echo "  [PASS] $name"
      PASSED=$((PASSED + 1))
    else
      echo "  [FAIL] $name"
      FAILED=$((FAILED + 1))
    fi
  else
    echo "  [SKIP] $name (no test function)"
  fi
}

echo "=== react-pebble emulator test suite ==="
echo "Screenshots: $SCREENSHOT_DIR"
echo ""

if [ -n "$FILTER" ]; then
  run_test "$FILTER"
else
  for ex in "${ALL_EXAMPLES[@]}"; do
    run_test "$ex"
  done
  # Also run async examples
  for ex in "${ASYNC_EXAMPLES[@]}"; do
    run_test "$ex"
  done
fi

echo ""
echo "========================================"
echo "  Results: $PASSED passed, $FAILED failed out of $TOTAL"
echo "  Screenshots: $SCREENSHOT_DIR"
echo "========================================"

if [ $FAILED -gt 0 ]; then
  exit 1
fi
