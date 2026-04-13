/**
 * examples/config-watchface.tsx — Configurable watchface with phone settings page.
 *
 * Demonstrates:
 *   - ConfigPage / ConfigSection / ConfigColor / ConfigToggle / ConfigText
 *   - useConfiguration hook to receive settings from phone
 *   - renderConfigPage / configPageToDataUri for generating the settings page
 *   - Dynamic styling based on user preferences
 *
 * The configuration page is generated as a self-contained HTML data URI
 * that the Pebble companion app opens when the user taps the gear icon.
 * Settings are sent back to the watch via the webviewclosed → AppMessage flow.
 *
 * For apps using an external URL instead:
 *   const { settings } = useConfiguration({
 *     url: 'https://mysite.com/my-config-page.html',
 *     defaults: { ... },
 *   });
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text, StatusBar } from '../src/index.js';
import { useTime, useConfiguration } from '../src/hooks/index.js';
import {
  ConfigPage,
  ConfigSection,
  ConfigColor,
  ConfigToggle,
  ConfigText,
  configPageToDataUri,
} from '../src/config/index.js';

// ---------------------------------------------------------------------------
// Define the configuration page (generates phone-side HTML)
// ---------------------------------------------------------------------------

const configSpec = ConfigPage(
  [
    ConfigSection('Colors', [
      ConfigColor('bgColor', 'Background Color', '000000'),
      ConfigColor('timeColor', 'Time Color', 'FFFFFF'),
      ConfigColor('dateColor', 'Date Color', '55FFFF'),
    ]),
    ConfigSection('Display', [
      ConfigToggle('showSeconds', 'Show Seconds', false),
      ConfigToggle('showDate', 'Show Date', true),
      ConfigText('greeting', 'Custom Greeting', 'Hello!'),
    ]),
  ],
  { appName: 'My Watchface Settings' },
);

// Generate the data URI for the config page
const configUrl = configPageToDataUri(configSpec);

// ---------------------------------------------------------------------------
// Watchface component
// ---------------------------------------------------------------------------

type WatchfaceSettings = Record<string, unknown> & {
  bgColor: string;
  timeColor: string;
  dateColor: string;
  showSeconds: boolean;
  showDate: boolean;
  greeting: string;
};

function ConfigurableWatchface() {
  const time = useTime();

  const { settings } = useConfiguration<WatchfaceSettings>({
    url: configUrl,
    defaults: {
      bgColor: '000000',
      timeColor: 'FFFFFF',
      dateColor: '55FFFF',
      showSeconds: false,
      showDate: true,
      greeting: 'Hello!',
    },
  });

  // Format time based on settings
  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');
  const timeStr = settings.showSeconds ? `${hours}:${minutes}:${seconds}` : `${hours}:${minutes}`;

  // Date string
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
  const dateStr = `${days[time.getDay()]} ${months[time.getMonth()]} ${time.getDate()}`;

  // Map hex colors to nearest Pebble color name (pass through as-is since
  // the renderer accepts hex strings prefixed with #)
  const bg = `#${settings.bgColor}`;
  const timeFg = `#${settings.timeColor}`;
  const dateFg = `#${settings.dateColor}`;

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill={bg} />

      {/* Greeting text */}
      <Text x={0} y={30} w={200} font="gothic18" color={dateFg} align="center">
        {settings.greeting}
      </Text>

      {/* Time display */}
      <Text x={0} y={70} w={200} font="bitham42Bold" color={timeFg} align="center">
        {timeStr}
      </Text>

      {/* Date display */}
      {settings.showDate && (
        <Text x={0} y={125} w={200} font="gothic24" color={dateFg} align="center">
          {dateStr}
        </Text>
      )}

      {/* Decorative divider */}
      <Rect x={40} y={120} w={120} h={1} fill={dateFg} />
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<ConfigurableWatchface />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('config-watchface example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
    console.log('Config URL length:', configUrl.length, 'bytes');
  }

  return app;
}

export default main;
