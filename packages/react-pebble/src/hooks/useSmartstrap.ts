/**
 * useSmartstrap — UART accessory protocol (fitness bands, GPS, extra sensors).
 *
 * Pebble's Smartstrap API exposes attribute-oriented reads/writes over a
 * 3-pin UART. The watch-side C API is a set of `smartstrap_*` calls; Moddable
 * currently has no public binding, so this hook delegates to whatever the
 * compiler emits on each target:
 *
 *   - C:     smartstrap_subscribe + smartstrap_attribute_create/read/write
 *   - Alloy: `globalThis.Smartstrap` if present, else {available:false}
 *   - Rocky: unsupported → {available:false}
 */

import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export interface SmartstrapAttributeOpts {
  /** Service ID (2-byte unsigned). */
  service: number;
  /** Attribute ID (2-byte unsigned). */
  attribute: number;
  /** Buffer size to allocate for this attribute (bytes). */
  length?: number;
}

export interface SmartstrapResult {
  /** Whether a smartstrap is currently connected and responding. */
  available: boolean;
  /** Issue a read and receive the bytes via `onNotify`. */
  read(): void;
  /** Write `data` to the attribute. */
  write(data: Uint8Array | ArrayBuffer): void;
  /** Set a handler for read responses and unsolicited notifications. */
  onNotify(handler: (data: Uint8Array) => void): () => void;
}

interface ModdableSmartstrap {
  available?: boolean;
  attribute?: (opts: SmartstrapAttributeOpts) => {
    read(): void;
    write(data: ArrayBuffer): void;
    onNotify?: (cb: (buf: ArrayBuffer) => void) => () => void;
    close?(): void;
  };
}

export function useSmartstrap(opts: SmartstrapAttributeOpts): SmartstrapResult {
  const handlerRef = useRef<((data: Uint8Array) => void) | null>(null);
  const attrRef = useRef<ReturnType<NonNullable<ModdableSmartstrap['attribute']>> | null>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (typeof globalThis === 'undefined') return undefined;
    const ss = (globalThis as Record<string, unknown>).Smartstrap as ModdableSmartstrap | undefined;
    if (!ss?.attribute) {
      setAvailable(false);
      return undefined;
    }
    const attr = ss.attribute(opts);
    attrRef.current = attr;
    setAvailable(ss.available ?? true);
    const unsub = attr.onNotify?.((buf) => {
      handlerRef.current?.(new Uint8Array(buf));
    });
    return () => {
      unsub?.();
      attr.close?.();
      attrRef.current = null;
    };
  }, [opts.service, opts.attribute, opts.length]);

  const read = useCallback(() => {
    attrRef.current?.read();
  }, []);
  const write = useCallback((data: Uint8Array | ArrayBuffer) => {
    let buf: ArrayBuffer;
    if (data instanceof Uint8Array) {
      const src = data.buffer as ArrayBuffer;
      buf = src.slice(data.byteOffset, data.byteOffset + data.byteLength);
    } else {
      buf = data;
    }
    attrRef.current?.write(buf);
  }, []);
  const onNotify = useCallback((handler: (data: Uint8Array) => void) => {
    handlerRef.current = handler;
    return () => {
      if (handlerRef.current === handler) handlerRef.current = null;
    };
  }, []);

  return { available, read, write, onNotify };
}
