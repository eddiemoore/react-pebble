/**
 * examples/dialog.tsx — Dialog component demo.
 *
 * Demonstrates:
 *   - Dialog component with title and body
 *   - Centered full-screen message layout
 */

import { Dialog } from '../src/components/index.js';

export default function DialogDemo() {
  return (
    <Dialog
      title="Confirm"
      body="Are you sure you want to proceed? Press SELECT to continue or BACK to cancel."
      backgroundColor="white"
      textColor="black"
    />
  );
}
