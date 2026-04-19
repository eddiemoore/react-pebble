/**
 * examples/window-stack.tsx — Multi-window navigation demo
 *
 * Demonstrates:
 *   - WindowStack for push/pop navigation
 *   - useNavigation hook
 *   - Back button auto-pops
 *   - Multiple screens with different content
 */

import type Poco from 'commodetto/Poco';
import { render } from '../src/index.js';
import { Text, Rect, Group, Window, WindowStack, useNavigation } from '../src/components/index.js';
import { useButton, useState } from '../src/hooks/index.js';

function HomeScreen() {
  const nav = useNavigation();

  useButton('select', () => nav.push(<DetailScreen title="Page 2" />));
  useButton('up', () => nav.push(<ColorScreen color="blue" label="Blue" />));
  useButton('down', () => nav.push(<ConfirmScreen />));

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Rect x={0} y={0} w={200} h={32} fill="white" />
      <Text x={4} y={6} w={192} font="gothic18Bold" color="black">
        Home
      </Text>

      <Text x={0} y={80} w={200} font="gothic24Bold" color="white" align="center">
        Window Stack
      </Text>
      <Text x={0} y={140} w={200} font="gothic14" color="lightGray" align="center">
        SELECT = Detail
      </Text>
      <Text x={0} y={160} w={200} font="gothic14" color="lightGray" align="center">
        UP = Blue / DOWN = Confirm
      </Text>
      <Text x={0} y={190} w={200} font="gothic14" color="lightGray" align="center">
        Depth: {nav.stackDepth}
      </Text>
    </Group>
  );
}

function DetailScreen({ title }: { title: string }) {
  const nav = useNavigation();

  useButton('select', () => nav.push(<ColorScreen color="green" label="Green" />));

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="darkGray" />
      <Rect x={0} y={0} w={200} h={32} fill="cyan" />
      <Text x={4} y={6} w={192} font="gothic18Bold" color="black">
        {title}
      </Text>

      <Text x={0} y={90} w={200} font="gothic24Bold" color="white" align="center">
        Detail View
      </Text>
      <Text x={0} y={150} w={200} font="gothic14" color="lightGray" align="center">
        SELECT = Push more
      </Text>
      <Text x={0} y={170} w={200} font="gothic14" color="lightGray" align="center">
        BACK = Go back
      </Text>
      <Text x={0} y={200} w={200} font="gothic14" color="lightGray" align="center">
        Depth: {nav.stackDepth}
      </Text>
    </Group>
  );
}

function ColorScreen({ color, label }: { color: string; label: string }) {
  const nav = useNavigation();

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill={color} />
      <Text x={0} y={90} w={200} font="bitham42Bold" color="white" align="center">
        {label}
      </Text>
      <Text x={0} y={170} w={200} font="gothic18" color="white" align="center">
        BACK to return
      </Text>
      <Text x={0} y={200} w={200} font="gothic14" color="white" align="center">
        Depth: {nav.stackDepth}
      </Text>
    </Group>
  );
}

/**
 * ConfirmScreen — demonstrates `onBack` handler and `backgroundColor` prop
 * on a Window pushed into the stack.  Instead of auto-popping, the custom
 * onBack shows a "goodbye" message before popping after a short delay.
 */
function ConfirmScreen() {
  const nav = useNavigation();
  const [message, setMessage] = useState('');

  return (
    <Window
      backgroundColor="darkGreen"
      onBack={() => {
        setMessage('Goodbye!');
        // Pop after a brief pause so the user sees the message
        setTimeout(() => nav.pop(), 500);
      }}
    >
      <Text x={0} y={40} w={200} font="gothic18Bold" color="white" align="center">
        Confirm Screen
      </Text>
      <Text x={0} y={90} w={200} font="gothic24Bold" color="white" align="center">
        {message || 'Press BACK'}
      </Text>
      <Text x={0} y={150} w={200} font="gothic14" color="lightGray" align="center">
        onBack shows a message first
      </Text>
      <Text x={0} y={200} w={200} font="gothic14" color="lightGray" align="center">
        Depth: {nav.stackDepth}
      </Text>
    </Window>
  );
}

function App() {
  return <WindowStack initial={<HomeScreen />} />;
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<App />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('window-stack example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
