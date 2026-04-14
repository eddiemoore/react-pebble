/**
 * examples/worker-demo.tsx — Watchapp paired with a background worker.
 *
 * Demonstrates the worker hooks:
 *   - useWorkerLaunch() — launch / kill the background worker
 *   - useWorkerMessage() — receive messages pushed from the worker
 *   - useWorkerSender() — send messages to the worker
 *
 * The worker itself is plain C — Pebble's worker runtime cannot host the
 * Alloy or Rocky JS runtimes. To pair an actual worker with this app, pass
 * `worker: './worker.c'` to `pebblePiu()` in your vite.config. The C side
 * uses `app_worker_message_subscribe()` and `app_worker_send_message()` to
 * communicate.
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text, Window } from '../src/index.js';
import { useState, useWorkerLaunch, useWorkerMessage, useWorkerSender } from '../src/hooks/index.js';

const MSG_REQUEST_STEPS = 1;
const MSG_STEPS_UPDATE = 2;

function WorkerApp() {
  const { launch, kill, isRunning } = useWorkerLaunch();
  const { send } = useWorkerSender();
  const [steps, setSteps] = useState(0);

  useWorkerMessage((msg) => {
    if (msg.type === MSG_STEPS_UPDATE) {
      setSteps(msg.data ?? 0);
    }
  });

  return (
    <Window
      onSelect={() => {
        if (isRunning) {
          kill();
        } else {
          launch();
          // After a moment, poke the worker for a fresh step count.
          send({ type: MSG_REQUEST_STEPS });
        }
      }}
      onUp={() => send({ type: MSG_REQUEST_STEPS })}
    >
      <Group>
        <Rect x={0} y={0} w={200} h={228} fill="black" />
        <Text x={0} y={40} w={200} font="gothic24Bold" color="white" align="center">
          Background Worker
        </Text>
        <Text x={0} y={90} w={200} font="bitham42Bold" color={isRunning ? '00FF00' : 'FF5500'} align="center">
          {isRunning ? 'ON' : 'OFF'}
        </Text>
        <Text x={0} y={150} w={200} font="gothic18" color="white" align="center">
          {steps} steps
        </Text>
        <Text x={0} y={190} w={200} font="gothic14" color="AAAAAA" align="center">
          SELECT toggle · UP refresh
        </Text>
      </Group>
    </Window>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<WorkerApp />, { poco: PocoCtor });
  if (app.platform.platform === 'mock') {
    console.log('worker-demo example (mock mode)');
  }
  return app;
}

export default main;
