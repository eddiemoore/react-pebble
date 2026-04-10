import { defineConfig } from 'vite';
import { pebblePiu } from './src/plugin/index.js';

// Test config — change entry to test different examples:
//   examples/watchface.tsx    (no buttons → watchface mode)
//   examples/counter.tsx      (buttons → watchapp mode)
//   examples/jira-lite.tsx    (buttons + list + branches)
//   examples/async-list.tsx   (useMessage, needs settleMs)

export default defineConfig({
  plugins: [
    pebblePiu({
      entry: process.env.ENTRY ?? 'examples/watchface.tsx',
      settleMs: Number(process.env.SETTLE_MS ?? '0') || undefined,
      deploy: process.env.DEPLOY === 'true',
    }),
  ],
  build: {
    outDir: '.pebble-build-vite-tmp',
    emptyOutDir: true,
    lib: { entry: 'src/index.ts', formats: ['es'] },
    rollupOptions: { external: [/./] },
  },
});
