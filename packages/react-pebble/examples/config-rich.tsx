/**
 * examples/config-rich.tsx — Showcase for Clay config element parity.
 *
 * Demonstrates every element type the library supports:
 *   ConfigHeading, ConfigColor, ConfigToggle, ConfigText, ConfigSelect,
 *   ConfigInput, ConfigRange, ConfigRadioGroup, ConfigCheckboxGroup,
 *   ConfigSubmit.
 *
 * The watchface side just reads a few of the new values to prove the
 * round-trip works; the real value here is the generated HTML page, which
 * is a self-contained data URI opened by the phone on gear-tap.
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text } from '../src/index.js';
import { useConfiguration } from '../src/hooks/index.js';
import {
  ConfigPage,
  ConfigSection,
  ConfigHeading,
  ConfigColor,
  ConfigToggle,
  ConfigText,
  ConfigSelect,
  ConfigInput,
  ConfigRange,
  ConfigRadioGroup,
  ConfigCheckboxGroup,
  ConfigSubmit,
  configPageToDataUri,
} from '../src/config/index.js';

const configSpec = ConfigPage([
  ConfigSection('Appearance', [
    ConfigHeading('Colors & look', 2),
    ConfigColor('bg', 'Background', '000000'),
    ConfigColor('fg', 'Foreground', 'FFFFFF'),
    ConfigToggle('invert', 'Invert at night', false),
  ]),
  ConfigSection('Profile', [
    ConfigInput('email', 'Email', '', { inputType: 'email', placeholder: 'you@example.com' }),
    ConfigText('name', 'Display name', 'Friend'),
    ConfigRange('fontSize', 'Text size', 10, 28, 18, 1),
  ]),
  ConfigSection('Workout', [
    ConfigSelect('sport', 'Sport', [
      { label: 'Running', value: 'run' },
      { label: 'Cycling', value: 'bike' },
      { label: 'Walking', value: 'walk' },
    ], 'run'),
    ConfigRadioGroup('units', 'Units', [
      { label: 'Metric (km)', value: 'metric' },
      { label: 'Imperial (mi)', value: 'imperial' },
    ], 'metric'),
    ConfigCheckboxGroup('metrics', 'Show metrics', [
      { label: 'Pace', value: 'pace' },
      { label: 'Heart rate', value: 'hr' },
      { label: 'Calories', value: 'cal' },
    ], ['pace', 'hr']),
  ]),
  ConfigSection('', [
    ConfigSubmit('Save', '00AA00'),
  ]),
], { appName: 'Rich Config Demo' });

const configUrl = configPageToDataUri(configSpec);

interface RichSettings extends Record<string, unknown> {
  bg: string;
  fg: string;
  invert: boolean;
  email: string;
  name: string;
  fontSize: number;
  sport: string;
  units: string;
  metrics: string[];
}

function RichConfigWatchface() {
  const { settings } = useConfiguration<RichSettings>({
    url: configUrl,
    defaults: {
      bg: '000000', fg: 'FFFFFF', invert: false,
      email: '', name: 'Friend', fontSize: 18,
      sport: 'run', units: 'metric', metrics: ['pace', 'hr'],
    },
  });

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill={`#${settings.bg}`} />
      <Text x={0} y={40} w={200} font="gothic24Bold" color={`#${settings.fg}`} align="center">
        Hi {settings.name}
      </Text>
      <Text x={0} y={90} w={200} font="gothic18" color={`#${settings.fg}`} align="center">
        {settings.sport} · {settings.units}
      </Text>
      <Text x={0} y={130} w={200} font="gothic14" color={`#${settings.fg}`} align="center">
        {settings.metrics.join(', ')}
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<RichConfigWatchface />, { poco: PocoCtor });
  if (app.platform.platform === 'mock') {
    console.log('config-rich example (mock mode)');
    console.log('Config URL length:', configUrl.length, 'bytes');
  }
  return app;
}

export default main;
