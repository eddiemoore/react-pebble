/**
 * examples/tokens.tsx — PebbleKit JS identity tokens.
 *
 * Demonstrates the three identity hooks surfaced by react-pebble. The
 * compiler emits PKJS that fetches each token and forwards it over
 * AppMessage using reserved keys. Useful when a backend needs to attribute
 * activity to a specific user, watch, or timeline subscriber.
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text } from '../src/index.js';
import {
  useAccountToken,
  useWatchToken,
  useTimelineToken,
} from '../src/hooks/index.js';

function TokensDemo() {
  const account = useAccountToken();
  const watchTok = useWatchToken();
  const { token: timelineTok, error } = useTimelineToken();

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <Text x={4} y={8} w={192} font="gothic18Bold" color="white" align="center">
        Identity Tokens
      </Text>
      <Text x={4} y={40} w={192} font="gothic14" color="AAFFAA">
        Account:
      </Text>
      <Text x={4} y={58} w={192} font="gothic14" color="white">
        {account ? account.slice(0, 18) : '(loading)'}
      </Text>
      <Text x={4} y={86} w={192} font="gothic14" color="AAFFAA">
        Watch:
      </Text>
      <Text x={4} y={104} w={192} font="gothic14" color="white">
        {watchTok ? watchTok.slice(0, 18) : '(loading)'}
      </Text>
      <Text x={4} y={132} w={192} font="gothic14" color="AAFFAA">
        Timeline:
      </Text>
      <Text x={4} y={150} w={192} font="gothic14" color="white">
        {timelineTok ? timelineTok.slice(0, 18) : error ?? '(loading)'}
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  return render(<TokensDemo />, { poco: PocoCtor });
}

export default main;
