/**
 * examples/health-advanced.tsx — Advanced health service hooks.
 *
 * Demonstrates:
 *   - useHealthAlert(): fire a callback when a metric crosses a threshold.
 *   - useHeartRateMonitor(): request aggressive HRM sampling for a workout.
 *   - useHealthHistory(): minute-by-minute history of a metric.
 *   - useMeasurementSystem(): user's preferred metric/imperial setting.
 */

import type Poco from 'commodetto/Poco';
import { render, Group, Rect, Text, Window } from '../src/index.js';
import {
  useState,
  useHealth,
  useHealthAlert,
  useHeartRateMonitor,
  useHealthHistory,
  useMeasurementSystem,
} from '../src/hooks/index.js';

function HealthAdvanced() {
  const { data: health } = useHealth();
  const units = useMeasurementSystem();
  const [hrAlert, setHrAlert] = useState<number | null>(null);

  // Ask for a 10-minute aggressive HRM window
  useHeartRateMonitor({ samplePeriodSeconds: 10 });

  // Fire on HR above 140 BPM
  useHealthAlert({
    metric: 'heartRateBPM',
    threshold: 140,
    direction: 'above',
    onTrigger: (v) => setHrAlert(v),
  });

  // 30 minutes of step history
  const history = useHealthHistory({ metric: 'steps', minutes: 30 });
  const avgSteps = history.length
    ? Math.round(history.reduce((a, b) => a + b, 0) / history.length)
    : 0;

  const distanceLabel = units === 'imperial' ? 'mi' : 'km';
  const distanceValue = units === 'imperial'
    ? (health.distance / 1609).toFixed(2)
    : (health.distance / 1000).toFixed(2);

  return (
    <Window>
      <Group>
        <Rect x={0} y={0} w={200} h={228} fill="black" />
        <Text x={0} y={15} w={200} font="gothic24Bold" color="white" align="center">
          Health+
        </Text>
        <Text x={0} y={55} w={200} font="gothic18" color="white" align="center">
          HR: {health.heartRate ?? '—'} BPM
        </Text>
        <Text x={0} y={85} w={200} font="gothic18" color="white" align="center">
          {distanceValue} {distanceLabel}
        </Text>
        <Text x={0} y={115} w={200} font="gothic18" color="55FFFF" align="center">
          avg: {avgSteps} steps/min
        </Text>
        <Text x={0} y={145} w={200} font="gothic18" color="AAAAAA" align="center">
          units: {units}
        </Text>
        <Text
          x={0}
          y={180}
          w={200}
          font="gothic18Bold"
          color={hrAlert ? 'FF0000' : '00AA00'}
          align="center"
        >
          {hrAlert ? `ALERT: ${hrAlert}` : 'HR ok'}
        </Text>
      </Group>
    </Window>
  );
}

export function main(PocoCtor?: typeof Poco) {
  return render(<HealthAdvanced />, { poco: PocoCtor });
}

export default main;
