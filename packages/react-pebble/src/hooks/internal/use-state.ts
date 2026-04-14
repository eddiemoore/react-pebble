/**
 * useState wrapper — the compiler patches this at compile time so it can
 * intercept and analyse state updates. Direct ESM re-exports are sealed
 * (getter-only), so we use a mutable internal reference that the compiler
 * patches via _setUseStateImpl().
 */

import { useState as _preactUseState } from 'preact/hooks';

type UseStateFn = <T>(init: T | (() => T)) => [T, (v: T | ((p: T) => T)) => void];
let _useStateImpl: UseStateFn = _preactUseState;

export function useState<T>(init: T | (() => T)): [T, (v: T | ((p: T) => T)) => void] {
  return _useStateImpl(init);
}

/** @internal — called by the compiler to intercept useState calls. */
export function _setUseStateImpl(impl: UseStateFn): void {
  _useStateImpl = impl;
}

/** @internal — restore original useState after compilation. */
export function _restoreUseState(): void {
  _useStateImpl = _preactUseState;
}
