/**
 * useCompass — magnetic heading via Moddable sensor API.
 */

import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export type CompassStatus = 'dataInvalid' | 'calibrating' | 'calibrated';

export interface CompassResult {
  /** True heading in degrees (0-360), corrected for declination. */
  heading: number;
  /** Raw magnetic heading before declination correction. */
  magneticHeading: number;
  /** Compass calibration state. */
  status: CompassStatus;
  /** Set minimum heading change (in degrees) before updates fire. No-op in mock mode. */
  setHeadingFilter: (degrees: number) => void;
}

/** @deprecated Use `CompassResult` instead. */
export interface CompassData {
  /** Heading in degrees (0-360, 0 = north). */
  heading: number;
}

// No-op filter setter used in mock mode.
const noopFilter = () => {};

/**
 * Read compass heading.
 *
 * On Alloy: reads from the Moddable Compass sensor.
 * In mock mode: returns a slowly rotating heading.
 */
export function useCompass(): CompassResult {
  const [heading, setHeading] = useState(0);
  const [magneticHeading, setMagneticHeading] = useState(0);
  const [status, setStatus] = useState<CompassStatus>('calibrated');
  const compassRef = useRef<{
    setHeadingFilter?: (degrees: number) => void;
    onSample?: (heading: number, magneticHeading?: number, status?: CompassStatus) => void;
    start?: () => void;
    stop?: () => void;
  } | null>(null);

  const setHeadingFilter = useCallback((degrees: number) => {
    compassRef.current?.setHeadingFilter?.(degrees);
  }, []);

  useEffect(() => {
    // Try to access the Alloy compass
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).__pbl_compass) {
      const compass = (globalThis as Record<string, unknown>).__pbl_compass as {
        setHeadingFilter?: (degrees: number) => void;
        onSample?: (heading: number, magneticHeading?: number, status?: CompassStatus) => void;
        start?: () => void;
        stop?: () => void;
      };
      compassRef.current = compass;
      compass.onSample = (h: number, mh?: number, s?: CompassStatus) => {
        setHeading(h);
        setMagneticHeading(mh ?? h);
        if (s) setStatus(s);
      };
      compass.start?.();
      return () => {
        compass.stop?.();
        compassRef.current = null;
      };
    }

    // Mock mode: slowly rotate
    const id = setInterval(() => {
      setHeading((h) => (h + 1) % 360);
      setMagneticHeading((h) => (h + 1) % 360);
    }, 100);
    return () => clearInterval(id);
  }, []);

  return {
    heading,
    magneticHeading,
    status,
    setHeadingFilter: compassRef.current ? setHeadingFilter : noopFilter,
  };
}
