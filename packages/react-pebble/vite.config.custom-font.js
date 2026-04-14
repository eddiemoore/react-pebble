import { defineConfig } from 'vite';
import { pebblePiu } from './src/plugin/index.js';

// One-off Vite config for the custom-font example — declares the TTF
// resource the example references so the Pebble build can compile it.

export default defineConfig({
  plugins: [
    pebblePiu({
      entry: 'examples/custom-font.tsx',
      target: process.env.COMPILE_TARGET ?? 'alloy',
      platform: process.env.PEBBLE_PLATFORM ?? 'emery',
      resources: [
        {
          type: 'font',
          name: 'ROBOTO_24',
          file: 'assets/fonts/roboto-regular.ttf',
          characterRegex: '[A-Za-z0-9 :_]',
        },
      ],
    }),
  ],
  build: {
    outDir: '.pebble-build-vite-tmp',
    emptyOutDir: true,
    lib: { entry: 'src/index.ts', formats: ['es'] },
    rollupOptions: { external: [/./] },
  },
});
