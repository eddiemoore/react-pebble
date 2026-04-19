/**
 * examples/dialog.tsx — Dialog component demo.
 *
 * Demonstrates:
 *   - Dialog component with title and body
 *   - Centered full-screen message layout
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Dialog } from '../src/components/index.js';

function DialogDemo() {
  return (
    <Dialog
      title="Confirm"
      body="Are you sure you want to proceed? Press SELECT to continue or BACK to cancel."
      backgroundColor="white"
      textColor="black"
    />
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<DialogDemo />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('dialog example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
