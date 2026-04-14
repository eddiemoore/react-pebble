/**
 * Shared prop types used across multiple component files.
 *
 * These are re-exported publicly from `components/index.tsx` so consumers
 * can keep importing them by name from `react-pebble`.
 */

import type { PebbleButtonHandler } from '../../hooks/index.js';

export interface PositionProps {
  x?: number;
  y?: number;
}

export interface SizeProps {
  w?: number;
  h?: number;
  /** Alias for `w`. */
  width?: number;
  /** Alias for `h`. */
  height?: number;
}

export interface ButtonHandlerProps {
  onUp?: PebbleButtonHandler;
  onDown?: PebbleButtonHandler;
  onSelect?: PebbleButtonHandler;
  onBack?: PebbleButtonHandler;
  onLongUp?: PebbleButtonHandler;
  onLongDown?: PebbleButtonHandler;
  onLongSelect?: PebbleButtonHandler;
}

export type ColorName =
  | 'black' | 'white' | 'red' | 'green' | 'blue' | 'yellow' | 'orange'
  | 'cyan' | 'magenta' | 'clear' | 'lightGray' | 'darkGray'
  // Pass-through for raw GColor / hex values
  | (string & {});

export type FontName =
  | 'gothic14' | 'gothic14Bold' | 'gothic18' | 'gothic18Bold'
  | 'gothic24' | 'gothic24Bold' | 'gothic28' | 'gothic28Bold'
  | 'bitham30Black' | 'bitham42Bold' | 'bitham42Light'
  | 'bitham34MediumNumbers' | 'bitham42MediumNumbers'
  | 'robotoCondensed21' | 'roboto21' | 'droid28'
  | 'leco20' | 'leco26' | 'leco28' | 'leco32' | 'leco36' | 'leco38' | 'leco42'
  | (string & {});

export type Alignment = 'left' | 'center' | 'right';

export type CompositeOp = 'assign' | 'set' | 'and' | 'or' | 'clear';

export interface BorderInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
