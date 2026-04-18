import { React } from './internal/preact-compat.js';
import type { ColorName } from './internal/shared-types.js';
import { useScreen } from '../hooks/useScreen.js';

export interface DialogProps {
  title: string;
  body?: string;
  /** Resource name for an icon displayed above the title. */
  icon?: string;
  /** Background color (default: 'white'). */
  backgroundColor?: ColorName;
  /** Text color (default: 'black'). */
  textColor?: ColorName;
}

/**
 * Dialog — a centered full-screen message layout matching Pebble's dialog UX.
 *
 * Renders a full-screen background with an optional icon, a bold centered
 * title, and optional body text that wraps via TextFlow.
 */
export function Dialog({
  title,
  body,
  icon,
  backgroundColor = 'white',
  textColor = 'black',
}: DialogProps) {
  const { width, height } = useScreen();

  const iconSize = 32;
  const iconY = 24;
  const titleY = icon ? iconY + iconSize + 8 : 40;
  const titleH = 36;
  const bodyY = titleY + titleH + 4;
  const bodyH = height - bodyY - 8;

  return React.createElement(
    'pbl-group',
    { x: 0, y: 0 },

    // Full-screen background
    React.createElement('pbl-rect', {
      x: 0,
      y: 0,
      w: width,
      h: height,
      fill: backgroundColor,
    }),

    // Optional icon
    icon
      ? React.createElement('pbl-image', {
          x: Math.floor((width - iconSize) / 2),
          y: iconY,
          w: iconSize,
          h: iconSize,
          src: icon,
        })
      : null,

    // Centered title
    React.createElement(
      'pbl-text',
      {
        x: 8,
        y: titleY,
        w: width - 16,
        h: titleH,
        font: 'bitham30Black',
        color: textColor,
        align: 'center',
      },
      title,
    ),

    // Optional body text (wrapping)
    body
      ? React.createElement(
          'pbl-textflow',
          {
            x: 12,
            y: bodyY,
            w: width - 24,
            h: bodyH,
            font: 'gothic18',
            color: textColor,
            align: 'center',
            flowAroundDisplay: true,
          },
          body,
        )
      : null,
  );
}
