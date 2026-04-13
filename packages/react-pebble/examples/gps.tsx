/**
 * examples/gps.tsx — GPS location display.
 *
 * Demonstrates:
 *   - useLocation hook (GPS via phone proxy)
 *   - Loading states
 *   - useButton to trigger refresh
 *   - StatusBar
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text, StatusBar } from '../src/index.js';
import { useLocation, useButton } from '../src/hooks/index.js';

function GPSApp() {
  const { location, loading, error, refresh } = useLocation({
    enableHighAccuracy: true,
    timeout: 15000,
  });

  // SELECT button triggers a fresh GPS fix
  useButton('select', refresh);

  const lat = location ? location.latitude.toFixed(4) : '--';
  const lng = location ? location.longitude.toFixed(4) : '--';

  return (
    <Group>
      <Rect x={0} y={0} w={200} h={228} fill="black" />
      <StatusBar color="white" backgroundColor="darkGray" separator="line" />

      {/* Title */}
      <Text x={0} y={24} w={200} font="gothic24Bold" color="white" align="center">
        GPS Location
      </Text>

      {/* Status indicator */}
      <Text x={0} y={56} w={200} font="gothic14" color={loading ? 'yellow' : error ? 'red' : 'green'} align="center">
        {loading ? 'Acquiring fix...' : error ? `Error: ${error}` : 'Location acquired'}
      </Text>

      {/* Latitude card */}
      <Rect x={10} y={80} w={180} h={50} fill="darkGray" borderRadius={6} />
      <Text x={18} y={84} w={164} font="gothic14" color="lightGray">
        Latitude
      </Text>
      <Text x={18} y={100} w={164} font="gothic28Bold" color="cyan">
        {lat}°
      </Text>

      {/* Longitude card */}
      <Rect x={10} y={138} w={180} h={50} fill="darkGray" borderRadius={6} />
      <Text x={18} y={142} w={164} font="gothic14" color="lightGray">
        Longitude
      </Text>
      <Text x={18} y={158} w={164} font="gothic28Bold" color="cyan">
        {lng}°
      </Text>

      {/* Refresh hint */}
      <Text x={0} y={200} w={200} font="gothic14" color="lightGray" align="center">
        Press SELECT to refresh
      </Text>
    </Group>
  );
}

export function main(PocoCtor?: typeof Poco) {
  const app = render(<GPSApp />, { poco: PocoCtor });

  if (app.platform.platform === 'mock') {
    console.log('gps example (mock mode)');
    console.log('Draw calls:', app.drawLog.length);
  }

  return app;
}

export default main;
