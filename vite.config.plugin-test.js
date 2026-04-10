import { defineConfig } from 'vite';
import { pebblePiu } from './src/plugin/index.js';

export default defineConfig({
  plugins: [
    pebblePiu({
      entry: 'examples/watchface.tsx',
      buildDir: '.pebble-build',
    }),
  ],
  build: {
    // Minimal build — the plugin does the real work in closeBundle
    outDir: '.pebble-build-vite-tmp',
    emptyOutDir: true,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
    },
    rollupOptions: {
      external: [/./],
    },
  },
});
