/**
 * examples/timeline-pins.tsx — Rich timeline pins.
 *
 * Builds a fully-specified Pebble timeline pin (calendar layout, reminder,
 * actions) and pushes it via useTimeline. The compiler-emitted PKJS
 * HTTP-PUTs the pin JSON to the Pebble public timeline API using the user's
 * timeline token (the `timeline` capability is auto-inferred).
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text } from '../src/index.js';
import { useTimeline, TimelineAction, useButton } from '../src/hooks/index.js';
import type { TimelinePin } from '../src/hooks/index.js';

function TimelinePinsDemo() {
  const { pushPin, removePin } = useTimeline();

  const demoPin: TimelinePin = {
    id: 'demo-pin-0001',
    time: Date.now() + 60 * 60 * 1000, // one hour from now
    duration: 30,
    layout: {
      type: 'calendarPin',
      title: 'Team standup',
      subtitle: 'Conf Room A',
      body: 'Daily sync — 15 min hard stop.',
      locationName: 'HQ, Floor 3',
      primaryColor: '#0055AA',
      secondaryColor: '#FFFFFF',
      backgroundColor: '#000000',
    },
    reminders: [
      {
        time: Date.now() + 55 * 60 * 1000,
        layout: { type: 'genericReminder', title: 'Standup in 5 min' },
      },
    ],
    actions: [
      TimelineAction.openWatchApp('Open app', 0x1),
      TimelineAction.http({
        title: 'Snooze 5m',
        url: 'https://example.com/snooze',
        method: 'POST',
        bodyJSON: { pinId: 'demo-pin-0001', minutes: 5 },
        successText: 'Snoozed',
      }),
      TimelineAction.remove('Dismiss'),
    ],
  };

  useButton('select', () => pushPin(demoPin));
  useButton('down', () => removePin(demoPin.id));

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Text x={4} y={8} w={192} font="gothic18Bold" color="white" align="center">
        Timeline Pins
      </Text>
      <Text x={4} y={56} w={192} font="gothic14" color="AAFFAA">
        SELECT: push demo pin
      </Text>
      <Text x={4} y={96} w={192} font="gothic14" color="FFAA55">
        DOWN: remove pin
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  return render(<TimelinePinsDemo />, { poco: PocoCtor });
}

export default main;
