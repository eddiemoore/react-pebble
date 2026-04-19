/**
 * examples/dictation.tsx — Voice-to-text dictation demo.
 *
 * Demonstrates:
 *   - useDictation hook for voice input
 *   - useButton for triggering dictation
 *   - Displaying transcript and status
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Group, Rect } from '../src/components/index.js';
import { useDictation, useButton, useState } from '../src/hooks/index.js';

function DictationDemo() {
  const { text, status, start, error } = useDictation();
  const [lastTranscript, setLastTranscript] = useState<string>('(none)');

  useButton('select', () => {
    if (status === 'idle' || status === 'done' || status === 'error') {
      start();
    }
  });

  // Update last transcript when dictation completes
  if (status === 'done' && text && text !== lastTranscript) {
    setLastTranscript(text);
  }

  const statusColor = status === 'done' ? 'green' : status === 'error' ? 'red' : 'white';

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      {/* Title bar */}
      <Rect x={0} y={0} w={200} h={32} fill="white" />
      <Text x={4} y={6} w={192} font="gothic18Bold" color="black">
        Dictation
      </Text>

      {/* Status */}
      <Text x={8} y={44} w={184} font="gothic18" color={statusColor}>
        Status: {status}
      </Text>

      {/* Transcript */}
      <Text x={8} y={72} w={184} font="gothic14" color="lightGray">
        Transcript:
      </Text>
      <Text x={8} y={90} w={184} font="gothic18" color="white">
        {lastTranscript}
      </Text>

      {/* Error display */}
      {error ? (
        <Text x={8} y={130} w={184} font="gothic14" color="red">
          Error: {error}
        </Text>
      ) : null}

      {/* Instructions */}
      <Text x={0} y={190} w={200} font="gothic14" color="lightGray" align="center">
        Press SELECT to dictate
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<DictationDemo />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('dictation example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
