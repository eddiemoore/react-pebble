/**
 * useFileStorage — ECMA-419 file system API.
 */

import { useCallback, useRef } from 'preact/hooks';

export interface UseFileStorageResult {
  /** Read a file. Returns null if file doesn't exist. */
  readFile: (path: string) => ArrayBuffer | null;
  /** Write data to a file. Returns true on success. */
  writeFile: (path: string, data: ArrayBuffer | string) => boolean;
  /** Delete a file. Returns true on success. */
  deleteFile: (path: string) => boolean;
  /** Check if a file exists. */
  exists: (path: string) => boolean;
}

/**
 * File system storage for binary or large data.
 *
 * On Alloy: uses the ECMA-419 `device.files` API.
 * In mock mode: uses an in-memory Map.
 */
export function useFileStorage(): UseFileStorageResult {
  const mockStore = useRef(new Map<string, ArrayBuffer>());

  // Check for ECMA-419 device.files
  const hasDevice = typeof globalThis !== 'undefined'
    && (globalThis as Record<string, unknown>).device
    && typeof ((globalThis as Record<string, unknown>).device as Record<string, unknown>)?.files === 'object';

  const readFile = useCallback((path: string): ArrayBuffer | null => {
    if (hasDevice) {
      const files = ((globalThis as Record<string, unknown>).device as { files: {
        openFile: (opts: { path: string }) => { read: (count: number, offset?: number) => ArrayBuffer; status: () => { size: number }; close: () => void } | null;
      } }).files;
      try {
        const f = files.openFile({ path });
        if (!f) return null;
        const stat = f.status();
        const data = f.read(stat.size, 0);
        f.close();
        return data;
      } catch {
        return null;
      }
    }
    return mockStore.current.get(path) ?? null;
  }, [hasDevice]);

  const writeFile = useCallback((path: string, data: ArrayBuffer | string): boolean => {
    if (hasDevice) {
      const files = ((globalThis as Record<string, unknown>).device as { files: {
        openFile: (opts: { path: string; mode?: string }) => { write: (data: ArrayBuffer, offset?: number) => void; close: () => void } | null;
      } }).files;
      try {
        const f = files.openFile({ path, mode: 'w' });
        if (!f) return false;
        const buf = typeof data === 'string' ? new TextEncoder().encode(data).buffer : data;
        f.write(buf as ArrayBuffer, 0);
        f.close();
        return true;
      } catch {
        return false;
      }
    }
    const buf = typeof data === 'string' ? new TextEncoder().encode(data).buffer : data;
    mockStore.current.set(path, buf as ArrayBuffer);
    return true;
  }, [hasDevice]);

  const deleteFile = useCallback((path: string): boolean => {
    if (hasDevice) {
      const files = ((globalThis as Record<string, unknown>).device as { files: {
        delete: (path: string) => void;
      } }).files;
      try {
        files.delete(path);
        return true;
      } catch {
        return false;
      }
    }
    return mockStore.current.delete(path);
  }, [hasDevice]);

  const exists = useCallback((path: string): boolean => {
    if (hasDevice) {
      const files = ((globalThis as Record<string, unknown>).device as { files: {
        openFile: (opts: { path: string }) => { close: () => void } | null;
      } }).files;
      try {
        const f = files.openFile({ path });
        if (!f) return false;
        f.close();
        return true;
      } catch {
        return false;
      }
    }
    return mockStore.current.has(path);
  }, [hasDevice]);

  return { readFile, writeFile, deleteFile, exists };
}
