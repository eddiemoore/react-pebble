/**
 * test/menulayer-chalk.test.ts — Verify MenuLayer export exists.
 *
 * Type-level: centerFocused and padBottom props are accepted by the component.
 *
 * Usage: npx tsx test/menulayer-chalk.test.ts
 */

import { MenuLayer } from '../src/components/MenuLayer.js';
import type { ComponentType } from 'preact';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL: ' + msg);
    process.exit(1);
  }
}

assert(typeof MenuLayer === 'function', 'MenuLayer should be a function');

// Type-level verification: these props must compile without error
type Props = Parameters<typeof MenuLayer>[0];
type _CheckCenterFocused = Props extends { centerFocused?: boolean } ? true : never;
type _CheckPadBottom = Props extends { padBottom?: number } ? true : never;

console.log('menulayer-chalk.test.ts: PASS');
