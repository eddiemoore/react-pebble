import { React, type ReactNode } from './internal/preact-compat.js';
import type {
  BorderInsets,
  ColorName,
  PositionProps,
  SizeProps,
} from './internal/shared-types.js';

export interface RectProps extends PositionProps, SizeProps {
  fill?: ColorName;
  stroke?: ColorName;
  strokeWidth?: number;
  borderRadius?: number;
  /** Texture resource path for bitmap-based skins (tiled backgrounds, sprite sheets). */
  texture?: string;
  /** Horizontal variant index (for sprite sheet textures). */
  variant?: number;
  /** Border insets for nine-patch-style skins. */
  borders?: BorderInsets;
  /** Tile insets for repeating texture regions. */
  tiles?: BorderInsets;
  children?: ReactNode;
}

export function Rect({ children, ...props }: RectProps) {
  return React.createElement('pbl-rect', props, children);
}
