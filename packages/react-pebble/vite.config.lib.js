import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

// Library build: produces ESM + CJS bundles + .d.ts for npm consumers.
// Preact is externalized so consumers dedupe it.
export default defineConfig({
  plugins: [
    dts({
      entryRoot: 'src',
      include: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.d.ts'],
      outDir: 'dist/lib',
      tsconfigPath: 'tsconfig.json',
      compilerOptions: { noEmit: false, declaration: true, emitDeclarationOnly: true },
    }),
  ],
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  build: {
    outDir: 'dist/lib',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        hooks: resolve(__dirname, 'src/hooks/index.ts'),
        components: resolve(__dirname, 'src/components/index.tsx'),
        compiler: resolve(__dirname, 'src/compiler/index.ts'),
        plugin: resolve(__dirname, 'src/plugin/index.ts'),
        config: resolve(__dirname, 'src/config/index.ts'),
        platform: resolve(__dirname, 'src/platform.ts'),
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: [
        'preact',
        'preact/hooks',
        'preact/jsx-runtime',
        'vite',
        'typescript',
        /^node:/,
      ],
    },
  },
});
