import { React } from './internal/preact-compat.js';
import { useState, useButton } from '../hooks/index.js';
import type { ColorName } from './internal/shared-types.js';

export interface NumberWindowProps {
  label: string;
  min?: number;
  max?: number;
  step?: number;
  initial?: number;
  onSelect?: (value: number) => void;
  onCancel?: () => void;
  backgroundColor?: ColorName;
  textColor?: ColorName;
}

export function NumberWindow({
  label,
  min = 0,
  max = 100,
  step = 1,
  initial = 0,
  onSelect,
  onCancel,
  backgroundColor = 'black',
  textColor = 'white',
}: NumberWindowProps) {
  const [value, setValue] = useState(Math.max(min, Math.min(max, initial)));

  useButton('up', () => {
    setValue((v) => Math.min(v + step, max));
  });
  useButton('down', () => {
    setValue((v) => Math.max(v - step, min));
  });
  useButton('select', () => {
    onSelect?.(value);
  });
  useButton('back', () => {
    onCancel?.();
  });

  return React.createElement(
    'pbl-group',
    { x: 0, y: 0 },
    // Background
    React.createElement('pbl-rect', { x: 0, y: 0, w: 200, h: 228, fill: backgroundColor }),
    // Label
    React.createElement('pbl-text', {
      x: 0, y: 40, w: 200, h: 28,
      font: 'gothic24Bold', color: textColor, align: 'center',
    }, label),
    // Value
    React.createElement('pbl-text', {
      x: 0, y: 85, w: 200, h: 50,
      font: 'bitham42Bold', color: textColor, align: 'center',
    }, String(value)),
    // Up arrow indicator
    React.createElement('pbl-text', {
      x: 0, y: 145, w: 200, h: 20,
      font: 'gothic18', color: 'darkGray', align: 'center',
    }, `\u25B2 / \u25BC`),
  );
}
