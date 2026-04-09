import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

// Library build: produces ESM + CJS bundles + .d.ts for npm consumers.
// React, react-reconciler, and scheduler are externalized so consumers
// dedupe them with their own copies.
export default defineConfig({
  plugins: [
    react({ jsxRuntime: 'classic' }),
    dts({
      entryRoot: 'src',
      include: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.d.ts'],
      outDir: 'dist/lib',
      tsconfigPath: 'tsconfig.json',
      // The library's noEmit tsconfig is for typechecking; dts overrides as needed.
      compilerOptions: { noEmit: false, declaration: true, emitDeclarationOnly: true },
    }),
  ],
  build: {
    outDir: 'dist/lib',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        hooks: resolve(__dirname, 'src/hooks/index.ts'),
        components: resolve(__dirname, 'src/components/index.tsx'),
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: [
        'react',
        'react-reconciler',
        'react-reconciler/constants',
        'react-reconciler/constants.js',
        'scheduler',
      ],
    },
  },
});
