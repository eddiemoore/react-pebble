/**
 * examples/file-notes.tsx — Simple note storage using file system API.
 *
 * Demonstrates:
 *   - useFileStorage hook (ECMA-419 file system)
 *   - useState for UI state
 *   - useButton for navigation
 *   - Reading and writing persistent files
 *   - ActionBar for button hints
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text, ActionBar } from '../src/index.js';
import { useState, useButton, useFileStorage } from '../src/hooks/index.js';

const NOTES = [
  'Buy groceries',
  'Call dentist',
  'Fix bike tire',
  'Read chapter 5',
  'Send invoice',
];

function FileNotesApp() {
  const files = useFileStorage();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [notes, setNotes] = useState<string[]>(() => {
    // Try to load saved notes from file storage
    const data = files.readFile('/notes.json');
    if (data) {
      try {
        const text = new TextDecoder().decode(data);
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed as string[];
      } catch {
        // Fall back to defaults
      }
    }
    return [...NOTES];
  });
  const [status, setStatus] = useState('');

  // Navigate notes
  useButton('up', () => {
    setSelectedIdx((i) => Math.max(0, i - 1));
  });
  useButton('down', () => {
    setSelectedIdx((i) => Math.min(notes.length - 1, i + 1));
  });

  // SELECT: toggle done (strikethrough) / save to file
  useButton('select', () => {
    setNotes((prev) => {
      const updated = [...prev];
      const note = updated[selectedIdx]!;
      // Toggle "done" marker
      updated[selectedIdx] = note.startsWith('[x] ')
        ? note.slice(4)
        : `[x] ${note}`;

      // Save to file
      const json = JSON.stringify(updated);
      const success = files.writeFile('/notes.json', json);
      setStatus(success ? 'Saved!' : 'Save failed');
      setTimeout(() => setStatus(''), 2000);

      return updated;
    });
  });

  const visibleNotes = notes.slice(0, 6); // Show up to 6 notes on screen

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />

      {/* Title bar */}
      <Rect x={0} y={0} w={200} h={28} fill="darkGray" />
      <Text x={8} y={4} w={160} font="gothic18Bold" color="white">
        Notes ({notes.length})
      </Text>

      {/* Status indicator */}
      {status ? (
        <Text x={120} y={6} w={50} font="gothic14" color="green">
          {status}
        </Text>
      ) : null}

      {/* Note list */}
      {visibleNotes.map((note, i) => {
        const isSelected = i === selectedIdx;
        const isDone = note.startsWith('[x] ');
        const displayText = isDone ? note.slice(4) : note;
        const rowY = 32 + i * 30;

        return (
          <Group key={i}>
            {/* Selection highlight */}
            {isSelected && (
              <Rect x={0} y={rowY} w={170} h={28} fill="blue" />
            )}
            {/* Done checkbox */}
            <Text x={4} y={rowY + 2} w={20} font="gothic18Bold" color={isDone ? 'green' : 'lightGray'}>
              {isDone ? '✓' : '○'}
            </Text>
            {/* Note text */}
            <Text
              x={24}
              y={rowY + 2}
              w={140}
              font="gothic18"
              color={isDone ? 'lightGray' : 'white'}
            >
              {displayText}
            </Text>
          </Group>
        );
      })}

      {/* File info at bottom */}
      <Text x={4} y={210} w={166} font="gothic14" color="lightGray">
        {files.exists('/notes.json') ? 'File: /notes.json' : 'No save file'}
      </Text>

      {/* Action bar */}
      <ActionBar backgroundColor="darkGray" />
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<FileNotesApp />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('file-notes example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
