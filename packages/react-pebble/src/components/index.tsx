/**
 * components/index.tsx — React component wrappers for Pebble primitives
 *
 * These provide a friendly JSX API that maps to the underlying
 * pbl-* element types the reconciler handles.
 */

import { h } from 'preact';
import type { ComponentChildren } from 'preact';
import type { PebbleButtonHandler } from '../hooks/index.js';

// Use Preact's `h` as a stand-in for `React.createElement` so we can keep
// the factory-based element construction that was in the react version.
const React = { createElement: h } as const;

// Unify ReactNode with Preact's ComponentChildren so we don't have to
// rename every prop type.
type ReactNode = ComponentChildren;

// ---------------------------------------------------------------------------
// Shared prop types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// JSX intrinsic element declarations for the pbl-* tags
// ---------------------------------------------------------------------------

declare module 'preact' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'pbl-root': IntrinsicPblProps;
      'pbl-rect': IntrinsicPblProps;
      'pbl-circle': IntrinsicPblProps;
      'pbl-text': IntrinsicPblProps;
      'pbl-line': IntrinsicPblProps;
      'pbl-image': IntrinsicPblProps;
      'pbl-group': IntrinsicPblProps;
      'pbl-statusbar': IntrinsicPblProps;
      'pbl-actionbar': IntrinsicPblProps;
    }
  }
}

interface IntrinsicPblProps {
  children?: ReactNode;
  // Loose escape hatch — wrappers below provide the typed surface.
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

export interface WindowProps extends ButtonHandlerProps {
  backgroundColor?: ColorName;
  fullscreen?: boolean;
  children?: ReactNode;
}

export function Window({ children, ...props }: WindowProps) {
  return React.createElement('pbl-group', props, children);
}

export interface RectProps extends PositionProps, SizeProps {
  fill?: ColorName;
  stroke?: ColorName;
  strokeWidth?: number;
  borderRadius?: number;
  children?: ReactNode;
}

export function Rect({ children, ...props }: RectProps) {
  return React.createElement('pbl-rect', props, children);
}

export interface CircleProps extends PositionProps {
  r?: number;
  /** Alias for `r`. */
  radius?: number;
  fill?: ColorName;
  stroke?: ColorName;
  strokeWidth?: number;
}

export function Circle(props: CircleProps) {
  return React.createElement('pbl-circle', props);
}

export interface TextProps extends PositionProps, SizeProps {
  font?: FontName;
  color?: ColorName;
  align?: Alignment;
  children?: ReactNode;
}

export function Text({ children, ...props }: TextProps) {
  return React.createElement('pbl-text', props, children);
}

export interface LineProps extends PositionProps {
  x2?: number;
  y2?: number;
  color?: ColorName;
  strokeWidth?: number;
}

export function Line(props: LineProps) {
  return React.createElement('pbl-line', props);
}

export interface ImageProps extends PositionProps {
  bitmap: unknown;
}

export function Image(props: ImageProps) {
  return React.createElement('pbl-image', props);
}

export interface GroupProps extends PositionProps {
  children?: ReactNode;
}

export function Group({ children, ...props }: GroupProps) {
  return React.createElement('pbl-group', props, children);
}

export interface StatusBarProps {
  color?: ColorName;
  backgroundColor?: ColorName;
  separator?: 'dotted' | 'line' | 'none';
}

export function StatusBar(props: StatusBarProps) {
  return React.createElement('pbl-statusbar', props);
}

export interface ActionBarProps {
  upIcon?: unknown;
  selectIcon?: unknown;
  downIcon?: unknown;
  backgroundColor?: ColorName;
}

export function ActionBar(props: ActionBarProps) {
  return React.createElement('pbl-actionbar', props);
}

// ---------------------------------------------------------------------------
// Convenience composites
// ---------------------------------------------------------------------------

export interface CardProps extends PositionProps {
  title: ReactNode;
  body?: ReactNode;
  titleFont?: FontName;
  bodyFont?: FontName;
  w?: number;
}

export function Card({
  title,
  body,
  titleFont,
  bodyFont,
  x = 0,
  y = 0,
  w = 144,
  ...props
}: CardProps) {
  const titleH = 28;
  const bodyY = titleH + 4;

  return React.createElement(
    'pbl-group',
    { x, y, ...props },
    React.createElement('pbl-rect', { x: 0, y: 0, w, h: titleH, fill: 'white' }),
    React.createElement(
      'pbl-text',
      {
        x: 4,
        y: 2,
        w: w - 8,
        h: titleH,
        font: titleFont ?? 'gothic18Bold',
        color: 'black',
      },
      title,
    ),
    body
      ? React.createElement(
          'pbl-text',
          {
            x: 4,
            y: bodyY,
            w: w - 8,
            h: 120,
            font: bodyFont ?? 'gothic14',
            color: 'white',
          },
          body,
        )
      : null,
  );
}

export interface BadgeProps extends PositionProps {
  r?: number;
  color?: ColorName;
  textColor?: ColorName;
  children?: ReactNode;
}

export function Badge({
  x = 0,
  y = 0,
  r = 12,
  color = 'red',
  textColor = 'white',
  children,
}: BadgeProps) {
  return React.createElement(
    'pbl-group',
    { x, y },
    React.createElement('pbl-circle', { x: 0, y: 0, r, fill: color }),
    React.createElement(
      'pbl-text',
      {
        x: 0,
        y: r - 8,
        w: r * 2,
        h: 16,
        font: 'gothic14Bold',
        color: textColor,
        align: 'center',
      },
      children,
    ),
  );
}
