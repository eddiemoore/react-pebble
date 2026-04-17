/**
 * examples/i18n.tsx — Internationalization.
 *
 * Demonstrates:
 *   - defineTranslations(): register strings per language/locale.
 *   - useTranslation(): resolve strings for the device's current locale
 *     with optional `{param}` interpolation.
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text } from '../src/index.js';
import { defineTranslations, useTranslation, useHealth } from '../src/hooks/index.js';

defineTranslations({
  en: {
    greeting: 'Hello',
    steps: '{n} steps',
    heartRate: 'HR {bpm} BPM',
  },
  fr: {
    greeting: 'Bonjour',
    steps: '{n} pas',
    heartRate: 'FC {bpm} BPM',
  },
  es: {
    greeting: 'Hola',
    steps: '{n} pasos',
    heartRate: 'FC {bpm} lpm',
  },
  de: {
    greeting: 'Hallo',
    steps: '{n} Schritte',
    heartRate: 'HF {bpm} BPM',
  },
}, 'en');

function I18NDemo() {
  const t = useTranslation();
  const { data: health } = useHealth();

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Text x={0} y={40} w={200} font="gothic24Bold" color="white" align="center">
        {t('greeting')}
      </Text>
      <Text x={0} y={100} w={200} font="gothic18" color="55FFFF" align="center">
        {t('steps', { n: health.steps })}
      </Text>
      <Text x={0} y={140} w={200} font="gothic18" color="FF5500" align="center">
        {t('heartRate', { bpm: health.heartRate ?? 0 })}
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  return render(<I18NDemo />, { poco: PocoCtor });
}

export default main;
