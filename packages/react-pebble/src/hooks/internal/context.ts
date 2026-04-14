/**
 * App context — provides access to the render app from nested components.
 */

import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { PebbleApp } from '../../pebble-render.js';

export const PebbleAppContext = createContext<PebbleApp | null>(null);

export function useApp(): PebbleApp {
  const app = useContext(PebbleAppContext);
  if (!app) {
    throw new Error('useApp must be used inside a react-pebble render tree');
  }
  return app;
}
