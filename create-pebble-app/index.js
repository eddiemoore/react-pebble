#!/usr/bin/env node

/**
 * create-pebble-app — scaffold a new react-pebble project.
 *
 * Usage:
 *   npx create-pebble-app my-watchface
 *   npx create-pebble-app my-watchface --counter   (counter template)
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const projectName = args.find(a => !a.startsWith('--'));
const template = args.includes('--counter') ? 'counter' : 'watchface';

if (!projectName) {
  console.log(`
  Usage: npx create-pebble-app <project-name> [--counter]

  Examples:
    npx create-pebble-app my-watchface
    npx create-pebble-app my-counter --counter
  `);
  process.exit(1);
}

const dir = resolve(projectName);

if (existsSync(dir)) {
  console.error(`Error: directory "${projectName}" already exists.`);
  process.exit(1);
}

console.log(`\n  Creating ${projectName}...\n`);

mkdirSync(join(dir, 'src'), { recursive: true });

// package.json
writeFileSync(join(dir, 'package.json'), JSON.stringify({
  name: projectName,
  version: '0.1.0',
  private: true,
  type: 'module',
  scripts: {
    build: 'vite build',
    deploy: 'vite build',
    typecheck: 'tsc --noEmit',
  },
  dependencies: {
    'react-pebble': '^0.1.0',
  },
  devDependencies: {
    'typescript': '^5.0.0',
    'vite': '^8.0.0',
  },
}, null, 2) + '\n');

// vite.config.ts
writeFileSync(join(dir, 'vite.config.ts'), `import { defineConfig } from 'vite';
import { pebblePiu } from 'react-pebble/plugin';

export default defineConfig({
  plugins: [
    pebblePiu({
      entry: 'src/App.tsx',
      deploy: true,
    }),
  ],
});
`);

// tsconfig.json
writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    target: 'es2022',
    module: 'esnext',
    moduleResolution: 'bundler',
    lib: ['es2022'],
    jsx: 'react-jsx',
    jsxImportSource: 'preact',
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true,
  },
  include: ['src'],
}, null, 2) + '\n');

// .gitignore
writeFileSync(join(dir, '.gitignore'), `node_modules/
dist/
.pebble-build/
*.log
`);

// src/App.tsx
if (template === 'counter') {
  writeFileSync(join(dir, 'src/App.tsx'), `import { render, Text, Rect, Group } from 'react-pebble';
import { useButton, useState } from 'react-pebble/hooks';

function Counter() {
  const [count, setCount] = useState(0);

  useButton('up', () => setCount((c: number) => c + 1));
  useButton('down', () => setCount((c: number) => c - 1));
  useButton('select', () => setCount(0));

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Rect x={0} y={0} w={200} h={32} fill="white" />
      <Text x={4} y={6} w={192} font="gothic18Bold" color="black">
        Counter
      </Text>
      <Text x={0} y={80} w={200} font="bitham42Bold" color="white" align="center">
        {count.toString()}
      </Text>
      <Text x={0} y={180} w={200} font="gothic14" color="lightGray" align="center">
        UP/DOWN to count, SELECT to reset
      </Text>
    </Group>
  );
}

export function main() {
  return render(<Counter />);
}
`);
} else {
  writeFileSync(join(dir, 'src/App.tsx'), `import { render, Text, Rect, Circle, Group } from 'react-pebble';
import { useTime } from 'react-pebble/hooks';

function WatchFace() {
  const time = useTime();
  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dateStr = days[time.getDay()] + ' ' + time.getDate();

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      {/* Hour markers */}
      <Circle x={92} y={10} r={6} fill="white" />
      <Circle x={174} y={100} r={6} fill="white" />
      <Circle x={92} y={190} r={6} fill="white" />
      <Circle x={10} y={100} r={6} fill="white" />

      {/* Center dot */}
      <Circle x={90} y={100} r={10} fill="red" />

      {/* Time */}
      <Text x={0} y={70} w={200} font="bitham42Bold" color="white" align="center">
        {hours}:{minutes}
      </Text>

      {/* Seconds */}
      <Text x={0} y={122} w={200} font="gothic24" color="lightGray" align="center">
        {seconds}
      </Text>

      {/* Date */}
      <Text x={0} y={158} w={200} font="gothic18" color="white" align="center">
        {dateStr}
      </Text>
    </Group>
  );
}

export function main() {
  return render(<WatchFace />);
}
`);
}

// Install dependencies
console.log('  Installing dependencies...\n');
try {
  execSync('npm install', { cwd: dir, stdio: 'inherit' });
} catch {
  console.log('\n  npm install failed — you can run it manually.');
}

console.log(`
  Done! Created ${projectName}/

  Next steps:
    cd ${projectName}
    npx vite build          Build + deploy to Pebble emulator

  Your app is in src/App.tsx — edit it and rebuild.
  The Vite plugin handles everything: compile → scaffold → deploy.

  Requires: Pebble SDK v4.9+ (pebble --version)
`);
