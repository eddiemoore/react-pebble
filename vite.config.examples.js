import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Example build — produces a single ESM bundle suitable for the Moddable
 * toolchain on Pebble Alloy.
 *
 * - Preact with automatic JSX runtime (no plugin needed; oxc handles it
 *   once `jsxImportSource` is set).
 * - Format: `es` (Moddable consumes ES modules natively).
 * - External: `commodetto/Poco` (resolved by Moddable's module loader).
 * - Output: pebble-spike/src/embeddedjs/main.js.
 */
const example = process.env.EXAMPLE ?? 'watchface';

export default defineConfig({
  // Preact's JSX automatic runtime is handled by oxc when the tsconfig sets
  // jsxImportSource to "preact". Vite 8's default JSX transform picks up
  // that setting for .tsx files.
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: 'preact',
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'pebble-spike/src/embeddedjs',
    emptyOutDir: false,
    target: 'es2020',
    minify: 'oxc',
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, 'pebble-spike/entry', `${example}.tsx`),
      formats: ['es'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: [
        'commodetto/Poco',
        'commodetto/PocoCore',
        /^commodetto\//,
        /^piu\//,
      ],
      output: {
        preserveModules: false,
      },
    },
  },
});
