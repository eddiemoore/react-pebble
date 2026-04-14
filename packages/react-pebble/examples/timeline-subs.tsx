/**
 * examples/timeline-subs.tsx — Timeline topic subscriptions.
 *
 * useTimelineSubscriptions manages the user's subscribed topics via PKJS
 * (Pebble.timelineSubscribe / timelineUnsubscribe / timelineSubscriptions).
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text } from '../src/index.js';
import { useTimelineSubscriptions, useButton } from '../src/hooks/index.js';

function TimelineSubsDemo() {
  const { topics, error, subscribe, unsubscribe, refresh } = useTimelineSubscriptions();

  useButton('up', () => subscribe('news'));
  useButton('down', () => unsubscribe('news'));
  useButton('select', () => refresh());

  const topicList = topics
    ? topics.length === 0 ? '(none)' : topics.join(', ')
    : error ?? '(loading)';

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Text x={4} y={8} w={192} font="gothic18Bold" color="white" align="center">
        Subscriptions
      </Text>
      <Text x={4} y={40} w={192} font="gothic14" color="AAFFAA">
        Topics:
      </Text>
      <Text x={4} y={60} w={192} font="gothic14" color="white">
        {topicList}
      </Text>
      <Text x={4} y={110} w={192} font="gothic14" color="FFAA55">
        UP: subscribe "news"
      </Text>
      <Text x={4} y={134} w={192} font="gothic14" color="FFAA55">
        DOWN: unsubscribe "news"
      </Text>
      <Text x={4} y={158} w={192} font="gothic14" color="FFAA55">
        SELECT: refresh list
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  return render(<TimelineSubsDemo />, { poco: PocoCtor });
}

export default main;
