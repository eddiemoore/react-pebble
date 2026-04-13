/**
 * examples/image.tsx — Demonstrates displaying an image on a Pebble watchface.
 *
 * Uses the <Image> component with a `src` prop. The compiler resolves the
 * image path at build time and includes it in the Pebble resource bundle.
 */

import type Poco from 'commodetto/Poco';
import { render, Rect, Image, Text, SCREEN } from '../src/index.js';

function ImageDemo() {
  return (
    <>
      <Rect x={0} y={0} w={SCREEN.width} h={SCREEN.height} fill="white" />
      <Image src="./assets/batman.png" x={Math.floor((SCREEN.width - 140) / 2)} y={Math.floor((SCREEN.height - 70) / 2)} w={140} h={70} />
      <Text y={Math.floor((SCREEN.height + 70) / 2) + 20} w={SCREEN.width} font="gothic18" color="black" align="center">
        Na na na na na na na na
      </Text>
    </>
  );
}

export function main(PocoCtor?: typeof Poco) {
  return render(<ImageDemo />, { poco: PocoCtor });
}
