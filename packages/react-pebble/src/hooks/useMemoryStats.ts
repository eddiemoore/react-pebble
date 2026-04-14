/**
 * useMemoryStats — heap-used / heap-free / largest-free.
 */

import { useEffect } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface MemoryStats {
  used: number;
  free: number;
  largestFree: number;
}

/**
 * Returns heap memory statistics. Useful for debugging OOMs on constrained
 * platforms (24 kB on aplite, 64 kB on basalt/chalk, 128 kB elsewhere).
 *
 * On Alloy: reads from `memory_bytes_used/free/largest_free` or XS's
 * `Memory.heap` introspection.
 * In mock mode: returns plausible static values.
 *
 * @param pollInterval — how often to re-sample (ms). Default 1000.
 */
export function useMemoryStats(pollInterval: number = 1000): MemoryStats {
  const [stats, setStats] = useState<MemoryStats>({ used: 0, free: 0, largestFree: 0 });

  useEffect(() => {
    const read = (): MemoryStats => {
      const g = globalThis as Record<string, unknown>;
      if (typeof g.memory_bytes_used === 'function') {
        return {
          used: Number((g.memory_bytes_used as () => number)()),
          free: typeof g.memory_bytes_free === 'function'
            ? Number((g.memory_bytes_free as () => number)())
            : 0,
          largestFree: typeof g.memory_largest_free === 'function'
            ? Number((g.memory_largest_free as () => number)())
            : 0,
        };
      }
      // Moddable XS Memory object, if exposed
      const mem = g.Memory as {
        used?: number; free?: number; largestFree?: number;
      } | undefined;
      if (mem && typeof mem.used === 'number') {
        return {
          used: mem.used,
          free: mem.free ?? 0,
          largestFree: mem.largestFree ?? 0,
        };
      }
      // Mock fallback
      return { used: 24_576, free: 40_960, largestFree: 32_768 };
    };

    setStats(read());
    const id = setInterval(() => setStats(read()), pollInterval);
    return () => clearInterval(id);
  }, [pollInterval]);

  return stats;
}
