/**
 * examples/animated-apng.tsx — Native APNG / PDC-sequence playback.
 *
 * <AnimatedImage src="spinner.apng" loop /> emits `gbitmap_sequence_*` on
 * the C target — the watch renders frames natively with the per-frame
 * delay encoded in the APNG. Swap the extension to `.pdcs` for a
 * PDC-sequence (vector) animation via `gdraw_command_sequence_*`.
 *
 * Declare the resource in your Vite plugin config (the auto-detector picks
 * up APNG/PDCS extensions, but an explicit declaration works too):
 *
 *   resources: [{ type: 'apng', name: 'SPINNER', file: 'resources/spinner.apng' }]
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text, AnimatedImage } from '../src/index.js';

function AnimatedApngDemo() {
  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Text x={0} y={12} w={200} font="gothic18Bold" color="white" align="center">
        Animated APNG
      </Text>
      <AnimatedImage src="assets/images/spinner.apng" x={76} y={76} w={48} h={48} loop />
      <Text x={0} y={170} w={200} font="gothic14" color="AAAAAA" align="center">
        Native gbitmap_sequence
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  return render(<AnimatedApngDemo />, { poco: PocoCtor });
}

export default main;
