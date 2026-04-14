/**
 * useLocation — GPS via phone proxy (one-shot).
 */

import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface LocationData {
  latitude: number;
  longitude: number;
}

export interface UseLocationOptions {
  /** Request high-accuracy GPS (slower, more battery). */
  enableHighAccuracy?: boolean;
  /** Timeout in ms for the location request. */
  timeout?: number;
  /** Maximum age in ms of a cached location to accept. */
  maximumAge?: number;
}

export interface UseLocationResult {
  location: LocationData | null;
  loading: boolean;
  error: string | null;
  /** Request a fresh location sample. */
  refresh: () => void;
}

/**
 * GPS location via the phone proxy.
 *
 * On Alloy: uses `embedded:sensor/Location` with `onSample()` / `sample()`.
 * In mock mode: returns a static San Francisco coordinate after a short delay.
 */
export function useLocation(options?: UseLocationOptions): UseLocationResult {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sensorRef = useRef<{ sample: () => LocationData; close?: () => void } | null>(null);

  const refresh = useCallback(() => {
    // Alloy runtime: embedded:sensor/Location
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Location) {
      try {
        const LocationClass = (globalThis as Record<string, unknown>).Location as new (opts: Record<string, unknown>) => {
          sample(): LocationData;
          configure?(opts: Record<string, unknown>): void;
          close?(): void;
        };
        setLoading(true);
        setError(null);
        const sensor = new LocationClass({
          onSample() {
            try {
              const data = sensor.sample();
              setLocation({ latitude: data.latitude, longitude: data.longitude });
              setLoading(false);
            } catch (e) {
              setError(String(e));
              setLoading(false);
            }
          },
        });
        if (sensor.configure) {
          sensor.configure({
            enableHighAccuracy: options?.enableHighAccuracy ?? false,
            timeout: options?.timeout ?? 30000,
            maximumAge: options?.maximumAge ?? 0,
          });
        }
        sensorRef.current = sensor;
      } catch (e) {
        setError(String(e));
        setLoading(false);
      }
      return;
    }

    // Mock mode: simulate a GPS fix
    setLoading(true);
    setError(null);
    setTimeout(() => {
      setLocation({ latitude: 37.7749, longitude: -122.4194 });
      setLoading(false);
    }, 500);
  }, [options?.enableHighAccuracy, options?.timeout, options?.maximumAge]);

  // Clean up sensor on unmount
  useEffect(() => {
    return () => {
      sensorRef.current?.close?.();
    };
  }, []);

  return { location, loading, error, refresh };
}
