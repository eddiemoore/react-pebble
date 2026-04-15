/**
 * test/time-granularity.test.ts — useTime native-tick surface.
 *
 * Covers:
 *   - runtime resolveGranularity(arg) mapping
 *   - emit-piu uses watch.addEventListener (not app.interval)
 *   - emit-rocky picks the right of 4 events
 *   - emit-c picks the right of 4 units
 *
 * Usage: npx tsx test/time-granularity.test.ts
 */

import { resolveGranularity } from '../src/hooks/useTime.js';
import { emitPiu } from '../scripts/emit-piu.js';
import { emitRocky } from '../scripts/emit-rocky.js';
import { emitC } from '../scripts/emit-c.js';
import type { CompilerIR, TimeGranularity } from '../scripts/compiler-ir.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------
// Runtime: resolveGranularity
// -----------------------------------------------------------------------
assert(resolveGranularity('minute') === 'minute', "resolveGranularity('minute')");
assert(resolveGranularity('second') === 'second', "resolveGranularity('second')");
assert(resolveGranularity('hour') === 'hour', "resolveGranularity('hour')");
assert(resolveGranularity('day') === 'day', "resolveGranularity('day')");

assert(resolveGranularity(1000) === 'second', 'resolveGranularity(1000)');
assert(resolveGranularity(500) === 'second', 'resolveGranularity(500)');
assert(resolveGranularity(60_000) === 'minute', 'resolveGranularity(60_000)');
assert(resolveGranularity(3_600_000) === 'hour', 'resolveGranularity(3_600_000)');
assert(resolveGranularity(86_400_000) === 'day', 'resolveGranularity(86_400_000)');

assert(resolveGranularity(undefined) === 'second', 'resolveGranularity(undefined) defaults to second');

// -----------------------------------------------------------------------
// Emitter fixtures
// -----------------------------------------------------------------------
function makeIR(granularity: TimeGranularity): CompilerIR {
  const format = granularity === 'day' ? 'DATE' : granularity === 'second' ? 'SS' : 'HHMM';
  return {
    tree: [{
      type: 'root', x: 0, y: 0, w: 144, h: 168,
      children: [
        {
          type: 'text', x: 0, y: 0, w: 144, h: 24,
          text: '', font: 'gothic24', color: '#ffffff',
          isTimeDynamic: true, labelIndex: 0, name: 'tl0',
        },
      ],
    }],
    platform: { name: 'basalt', width: 144, height: 168 },
    stateSlots: [],
    timeDeps: new Map([[0, format]]),
    stateDeps: new Map(),
    skinDeps: new Map(),
    branches: new Map(),
    conditionalChildren: [],
    listInfo: null,
    listSlotLabels: new Set(),
    timeReactiveGraphics: [],
    animatedElements: [],
    messageInfo: null,
    configInfo: null,
    hasButtons: false,
    hasTimeDeps: true,
    hasStateDeps: false,
    hasBranches: false,
    hasConditionals: false,
    hasSkinDeps: false,
    hasList: false,
    hasAnimatedElements: false,
    hasImages: false,
    imageResources: [],
    timeGranularity: granularity,
  } as unknown as CompilerIR;
}

// emit-piu: minute granularity uses watch.addEventListener('minutechange')
{
  const piuMin = emitPiu(makeIR('minute'), 'fixture');
  assert(
    piuMin.includes("watch.addEventListener('minutechange'"),
    "Alloy minute must emit watch.addEventListener('minutechange')",
  );
  assert(
    !piuMin.includes('app.interval = 1000'),
    'Alloy must not emit app.interval = 1000 anymore',
  );
  assert(
    !piuMin.includes('app.start()'),
    'Alloy must not emit app.start() for time ticks',
  );
}

// Second granularity uses secondchange
{
  const piuSec = emitPiu(makeIR('second'), 'fixture');
  assert(
    piuSec.includes("watch.addEventListener('secondchange'"),
    "Alloy second must emit watch.addEventListener('secondchange')",
  );
}

// Day granularity uses daychange
{
  const piuDay = emitPiu(makeIR('day'), 'fixture');
  assert(
    piuDay.includes("watch.addEventListener('daychange'"),
    "Alloy day must emit watch.addEventListener('daychange')",
  );
}

// emit-rocky
assert(emitRocky(makeIR('second')).includes("rocky.on('secondchange'"), 'Rocky second');
assert(emitRocky(makeIR('minute')).includes("rocky.on('minutechange'"), 'Rocky minute');
assert(emitRocky(makeIR('hour')).includes("rocky.on('hourchange'"), 'Rocky hour');
assert(emitRocky(makeIR('day')).includes("rocky.on('daychange'"), 'Rocky day');

// emit-c
assert(emitC(makeIR('second')).includes('tick_timer_service_subscribe(SECOND_UNIT'), 'C second');
assert(emitC(makeIR('minute')).includes('tick_timer_service_subscribe(MINUTE_UNIT'), 'C minute');
assert(emitC(makeIR('hour')).includes('tick_timer_service_subscribe(HOUR_UNIT'), 'C hour');
assert(emitC(makeIR('day')).includes('tick_timer_service_subscribe(DAY_UNIT'), 'C day');

console.log('time-granularity.test.ts: PASS');
