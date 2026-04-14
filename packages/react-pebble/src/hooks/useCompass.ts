/**
 * useCompass — magnetic heading via Moddable sensor API.
 */

import { useEffect } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface CompassData {
  /** Heading in degrees (0-360, 0 = north). */
  heading: number;
}

/**
 * Read compass heading.
 *
 * On Alloy: reads from the Moddable Compass sensor.
 * In mock mode: returns a slowly rotating heading.
 */
export function useCompass(): CompassData {
  const [heading, setHeading] = useState(0);

  useEffect(() => {
    // Try to access the Alloy compass
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).__pbl_compass) {
      const compass = (globalThis as Record<string, unknown>).__pbl_compass as {
        onSample?: (heading: number) => void;
        start?: () => void;
        stop?: () => void;
      };
      compass.onSample = (h: number) => setHeading(h);
      compass.start?.();
      return () => compass.stop?.();
    }

    // Mock mode: slowly rotate
    const id = setInterval(() => {
      setHeading((h) => (h + 1) % 360);
    }, 100);
    return () => clearInterval(id);
  }, []);

  return { heading };
}
