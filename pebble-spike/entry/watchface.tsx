/**
 * Alloy entry shim for the watchface example.
 *
 * Vite bundles this file into pebble-spike/src/embeddedjs/main.js as an
 * ESM module, keeping `commodetto/Poco` as an external import so Moddable's
 * module loader resolves it at runtime on the watch.
 *
 * The logical flow:
 *   1. Import Poco (resolved by Moddable).
 *   2. Import the watchface example's `main()` function (bundled inline).
 *   3. Call main(Poco) to instantiate the renderer and start React.
 */

import Poco from 'commodetto/Poco';
import { main } from '../../examples/watchface.js';

main(Poco);
