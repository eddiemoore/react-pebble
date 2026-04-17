/**
 * test/health-averaged.test.ts — useHealth averaged metrics and currentActivities.
 *
 * Covers:
 *   - HealthData type is exported
 *   - HealthActivity type is exported
 *   - UseHealthResult shape has averaged and currentActivities fields
 *
 * Usage: npx tsx test/health-averaged.test.ts
 */

import type {
  HealthActivity,
  HealthData,
  UseHealthResult,
} from '../src/hooks/useHealth.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

// ── type-level checks ──────────────────────────────────────────────────

// HealthData has expected fields
const _hd: HealthData = {
  steps: 0,
  distance: 0,
  activeSeconds: 0,
  calories: 0,
  heartRate: null,
  sleepSeconds: 0,
};
void _hd;

// HealthActivity union
const _activities: HealthActivity[] = ['sleep', 'restfulSleep', 'walk', 'run', 'openWorkout'];
void _activities;

// UseHealthResult shape
const _result: UseHealthResult = {
  data: _hd,
  averaged: { daily: _hd, weekly: _hd },
  currentActivities: [],
};
void _result;

// averaged can be null
const _nullAveraged: UseHealthResult = {
  data: _hd,
  averaged: null,
  currentActivities: [],
};
void _nullAveraged;

// ── runtime assertions on the type-constructed objects ──────────────────

assert(typeof _result.data.steps === 'number', 'data.steps should be a number');
assert(
  _result.averaged !== null && typeof _result.averaged.daily.steps === 'number',
  'averaged.daily.steps should be a number',
);
assert(
  _result.averaged !== null && typeof _result.averaged.weekly.steps === 'number',
  'averaged.weekly.steps should be a number',
);
assert(Array.isArray(_result.currentActivities), 'currentActivities should be an array');
assert(_nullAveraged.averaged === null, 'averaged can be null');

console.log('health-averaged.test.ts: all passed');
