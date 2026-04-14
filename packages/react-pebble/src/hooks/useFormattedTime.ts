import { clockIs24HourStyle, useTime } from './useTime.js';

/**
 * Format the current time. `format` uses the Pebble/strftime-ish tokens:
 *   HH — 24-hour hour (00-23)
 *   hh — 12-hour hour (01-12)
 *   mm — minute (00-59)
 *   ss — second (00-59)
 *   a  — AM/PM marker
 *
 * Pass `'auto'` to use the user's preferred 24h/12h style.
 */
export function useFormattedTime(format: string = 'HH:mm'): string {
  const resolvedFormat = format === 'auto'
    ? (clockIs24HourStyle() ? 'HH:mm' : 'hh:mm a')
    : format;
  const time = useTime(resolvedFormat.includes('ss') ? 1000 : 60000);

  const hours24 = time.getHours();
  const hours12 = hours24 % 12 || 12;
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');
  const ampm = hours24 < 12 ? 'AM' : 'PM';

  let result = resolvedFormat;
  result = result.replace('HH', hours24.toString().padStart(2, '0'));
  result = result.replace('hh', hours12.toString().padStart(2, '0'));
  result = result.replace('mm', minutes);
  result = result.replace('ss', seconds);
  result = result.replace('a', ampm);

  return result;
}
