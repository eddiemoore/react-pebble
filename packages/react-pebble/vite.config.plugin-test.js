import { defineConfig } from 'vite';
import { pebblePiu } from './src/plugin/index.js';

// Test config — change entry to test different examples:
//   examples/watchface.tsx    (no buttons → watchface mode)
//   examples/counter.tsx      (buttons → watchapp mode)
//   examples/jira-lite.tsx    (buttons + list + branches)
//   examples/async-list.tsx   (useMessage, needs settleMs)

const entry = process.env.ENTRY ?? 'examples/watchface.tsx';

// Per-example resource bundles — tests that need fonts / APNG resources
// plug into this map so `test-emulator.sh` can build them without changing
// the generic config for every example.
const resourcesByEntry = {
  'examples/custom-font.tsx': [
    {
      type: 'font',
      name: 'ROBOTO_24',
      file: 'assets/fonts/roboto-regular.ttf',
      characterRegex: '[A-Za-z0-9 :_]',
    },
  ],
};

export default defineConfig({
  plugins: [
    pebblePiu({
      entry,
      target: process.env.COMPILE_TARGET ?? 'alloy',
      platform: process.env.PEBBLE_PLATFORM ?? 'emery',
      settleMs: Number(process.env.SETTLE_MS ?? '0') || undefined,
      deploy: process.env.DEPLOY === 'true',
      resources: resourcesByEntry[entry],
    }),
  ],
  build: {
    outDir: '.pebble-build-vite-tmp',
    emptyOutDir: true,
    lib: { entry: 'src/index.ts', formats: ['es'] },
    rollupOptions: { external: [/./] },
  },
});
